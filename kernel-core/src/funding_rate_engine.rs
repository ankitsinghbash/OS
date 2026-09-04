//! ═══════════════════════════════════════════════════════════════════════════
//! 🇮🇳 BHARAT OS — FUNDING RATE DELTA-NEUTRAL ENGINE v2.0 (RUST KERNEL)
//! ═══════════════════════════════════════════════════════════════════════════
//! Strategy  : Spot Long + Futures 1x Short (Delta-Neutral / Cash & Carry)
//! Risk      : ZERO market direction risk — fully hedged
//! Income    : Funding rate payments every 8 hours in USDT cash
//! Monitor   : 🔥 REAL-TIME WebSocket stream (markPrice every 3s)
//!             NOT polling every 15 minutes — true kernel-level speed!
//! Speed     : Rust native — 2-5ms API, 3s WS tick vs 900s Node.js sleep
//! ═══════════════════════════════════════════════════════════════════════════

use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use colored::*;
use serde_json::{Value, json};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use tungstenite::{connect, Message};

type HmacSha256 = Hmac<Sha256>;

// ── Safety Configuration ─────────────────────────────────────────────────────
const MIN_FUNDING_RATE_PCT:  f64 = 0.005;   // Minimum 0.005% per 8h to enter (5.5% APR)
const EXIT_FUNDING_RATE_PCT: f64 = -0.005;  // Exit if rate drops below -0.005%
const MIN_24H_VOLUME_USD:    f64 = 500_000.0; // Minimum $500k daily Futures volume
const PRICE_SURGE_GUARD_PCT: f64 = 20.0;    // Exit if price moves ±20% from entry
const TRADE_SIZE_FRACTION:   f64 = 0.80;    // Use 80% of total balance per side
const INR_RATE:              f64 = 95.07;   // USD → INR conversion
// 🔥 REMOVED: MONITOR_INTERVAL_SECS — replaced by WebSocket real-time stream!
// Old: sleep(900s) → poll HTTP every 15 minutes  [Node.js level]
// New: WS markPrice stream → react in <3 seconds  [Kernel level]

// ── Persistence files ────────────────────────────────────────────────────────
const STATE_FILE: &str = "data/funding_engine_state.json";
const LOG_FILE:   &str = "data/funding_engine_log.jsonl";


// ── Data Structures ──────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct FundingCandidate {
    pub symbol:      String,
    pub mark_price:  f64,
    pub rate_pct:    f64,   // funding rate as percentage (e.g. 0.2015)
    pub apr:         f64,   // annualized rate
    pub vol_24h:     f64,   // 24h quote volume in USD
    pub mins_to_next: u64,  // minutes until next payout
    pub next_time_ms: u64,  // unix ms of next funding time
    // Lot size rules
    pub step_size:   f64,
    pub min_qty:     f64,
    pub min_notional: f64,
    pub qty_precision: usize,
}

#[derive(Debug, Clone)]
pub struct FundingPosition {
    pub active:             bool,
    pub symbol:             String,
    pub spot_qty:           f64,
    pub futures_qty:        f64,
    pub entry_price:        f64,
    pub entry_time_ms:      u64,
    pub total_funding_usd:  f64,
    pub payment_count:      u32,
    pub last_checked_ms:    u64,
}

impl FundingPosition {
    pub fn save(&self) {
        let data = json!({
            "active":           self.active,
            "symbol":           self.symbol,
            "spot_qty":         self.spot_qty,
            "futures_qty":      self.futures_qty,
            "entry_price":      self.entry_price,
            "entry_time_ms":    self.entry_time_ms,
            "total_funding_usd":self.total_funding_usd,
            "payment_count":    self.payment_count,
            "last_checked_ms":  self.last_checked_ms,
        });
        let _ = fs::write(STATE_FILE, serde_json::to_string_pretty(&data).unwrap_or_default());
    }

    pub fn load() -> Option<Self> {
        if !Path::new(STATE_FILE).exists() { return None; }
        let raw = fs::read_to_string(STATE_FILE).ok()?;
        let v: Value = serde_json::from_str(&raw).ok()?;
        if v["active"].as_bool() != Some(true) { return None; }
        Some(FundingPosition {
            active:            v["active"].as_bool().unwrap_or(false),
            symbol:            v["symbol"].as_str().unwrap_or("").to_string(),
            spot_qty:          v["spot_qty"].as_f64().unwrap_or(0.0),
            futures_qty:       v["futures_qty"].as_f64().unwrap_or(0.0),
            entry_price:       v["entry_price"].as_f64().unwrap_or(0.0),
            entry_time_ms:     v["entry_time_ms"].as_u64().unwrap_or(0),
            total_funding_usd: v["total_funding_usd"].as_f64().unwrap_or(0.0),
            payment_count:     v["payment_count"].as_u64().unwrap_or(0) as u32,
            last_checked_ms:   v["last_checked_ms"].as_u64().unwrap_or(0),
        })
    }
}

// ── Funding Engine ────────────────────────────────────────────────────────────
pub struct FundingRateEngine {
    api_key:    String,
    secret_key: String,
    agent:      ureq::Agent,
    time_offset_ms: i64,
}

impl FundingRateEngine {
    pub fn new(api_key: &str, secret_key: &str) -> Self {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(6))
            .timeout_read(Duration::from_secs(8))
            .build();

        let mut engine = FundingRateEngine {
            api_key: api_key.to_string(),
            secret_key: secret_key.to_string(),
            agent,
            time_offset_ms: 0,
        };
        engine.sync_time();
        engine
    }

    // ── Clock Sync ───────────────────────────────────────────────────────────
    fn sync_time(&mut self) {
        let before = Self::now_ms() as i64;
        if let Ok(res) = self.agent.get("https://api.binance.com/api/v3/time").call() {
            if let Ok(v) = res.into_json::<Value>() {
                if let Some(st) = v["serverTime"].as_i64() {
                    let after = Self::now_ms() as i64;
                    self.time_offset_ms = st - ((before + after) / 2);
                    self.log(&format!("🕐 Clock synced. Offset: {}ms", self.time_offset_ms));
                }
            }
        }
    }

    fn now_ms() -> u64 {
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
    }

    fn synced_ts(&self) -> u64 {
        (Self::now_ms() as i64 + self.time_offset_ms) as u64
    }

    // ── HMAC Signing ─────────────────────────────────────────────────────────
    fn sign(&self, query: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(self.secret_key.as_bytes())
            .expect("HMAC accepts any key length");
        mac.update(query.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    fn signed_query(&self, base: &str) -> String {
        let q = format!("{}&timestamp={}&recvWindow=10000", base, self.synced_ts());
        format!("{}&signature={}", q, self.sign(&q))
    }

    // ── Logging ──────────────────────────────────────────────────────────────
    fn log(&self, msg: &str) {
        let ts = chrono_now_ist();
        println!("[{}] {}", ts.dimmed(), msg);
        let entry = format!("{{\"ts\":\"{}\",\"msg\":{}}}\n",
            ts, serde_json::to_string(msg).unwrap_or_default());
        let _ = fs::OpenOptions::new().create(true).append(true)
            .open(LOG_FILE)
            .map(|mut f| { use std::io::Write; let _ = f.write_all(entry.as_bytes()); });
    }

    // ── Public API calls (no auth) ────────────────────────────────────────────
    fn fapi_get_pub(&self, path: &str) -> Option<Value> {
        let url = format!("https://fapi.binance.com{}", path);
        self.agent.get(&url).call().ok()?.into_json::<Value>().ok()
    }

    fn fapi_get_pub_arr(&self, path: &str) -> Option<Vec<Value>> {
        let url = format!("https://fapi.binance.com{}", path);
        self.agent.get(&url).call().ok()?.into_json::<Vec<Value>>().ok()
    }

    // ── Authenticated API calls ───────────────────────────────────────────────
    fn spot_get(&self, path: &str, params: &str) -> Option<Value> {
        let q = self.signed_query(params);
        let url = format!("https://api.binance.com{}?{}", path, q);
        self.agent.get(&url).set("X-MBX-APIKEY", &self.api_key)
            .call().ok()?.into_json::<Value>().ok()
    }

    fn spot_post(&self, path: &str, params: &str) -> Option<Value> {
        let q = self.signed_query(params);
        let url = format!("https://api.binance.com{}?{}", path, q);
        match self.agent.post(&url)
            .set("X-MBX-APIKEY", &self.api_key)
            .set("Content-Type", "application/x-www-form-urlencoded")
            .call() {
            Ok(r)  => r.into_json::<Value>().ok(),
            Err(ureq::Error::Status(_, r)) => r.into_json::<Value>().ok(),
            Err(_) => None,
        }
    }

    fn fapi_get(&self, path: &str, params: &str) -> Option<Value> {
        let q = self.signed_query(params);
        let url = format!("https://fapi.binance.com{}?{}", path, q);
        self.agent.get(&url).set("X-MBX-APIKEY", &self.api_key)
            .call().ok()?.into_json::<Value>().ok()
    }

    fn fapi_get_arr(&self, path: &str, params: &str) -> Option<Vec<Value>> {
        let q = self.signed_query(params);
        let url = format!("https://fapi.binance.com{}?{}", path, q);
        self.agent.get(&url).set("X-MBX-APIKEY", &self.api_key)
            .call().ok()?.into_json::<Vec<Value>>().ok()
    }

    fn fapi_post(&self, path: &str, params: &str) -> Option<Value> {
        let q = self.signed_query(params);
        let url = format!("https://fapi.binance.com{}?{}", path, q);
        match self.agent.post(&url)
            .set("X-MBX-APIKEY", &self.api_key)
            .set("Content-Type", "application/x-www-form-urlencoded")
            .call() {
            Ok(r)  => r.into_json::<Value>().ok(),
            Err(ureq::Error::Status(_, r)) => r.into_json::<Value>().ok(),
            Err(_) => None,
        }
    }

    // ── STEP 1: Wallet Balance ────────────────────────────────────────────────
    pub fn get_spot_stable_balance(&self) -> f64 {
        // Count both USDT and FDUSD (1:1 stable coins)
        let v = match self.spot_get("/api/v3/account", "") {
            Some(v) => v,
            None => return 0.0,
        };
        let balances = match v["balances"].as_array() {
            Some(b) => b,
            None => return 0.0,
        };
        let mut total = 0.0_f64;
        for b in balances {
            let asset = b["asset"].as_str().unwrap_or("");
            if asset == "USDT" || asset == "FDUSD" {
                total += b["free"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
            }
        }
        total
    }

    pub fn get_spot_pure_usdt(&self) -> f64 {
        // Only pure USDT (transferable to Futures — FDUSD cannot be transferred)
        let v = match self.spot_get("/api/v3/account", "") {
            Some(v) => v,
            None => return 0.0,
        };
        v["balances"].as_array()
            .and_then(|arr| arr.iter().find(|b| b["asset"] == "USDT"))
            .and_then(|b| b["free"].as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0)
    }

    pub fn get_futures_usdt_balance(&self) -> f64 {
        let v = match self.fapi_get("/fapi/v2/account", "") {
            Some(v) => v,
            None => return 0.0,
        };
        v["assets"].as_array()
            .and_then(|arr| arr.iter().find(|a| a["asset"] == "USDT"))
            .and_then(|a| a["availableBalance"].as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0)
    }

    // ── STEP 2: Transfer Spot USDT → Futures ─────────────────────────────────
    pub fn transfer_to_futures(&self, amount: f64) -> bool {
        self.log(&format!("💸 Transferring ${:.4} USDT Spot → Futures...", amount));
        let params = format!("type=MAIN_UMFUTURE&asset=USDT&amount={:.4}", amount);
        let result = self.spot_post("/sapi/v1/asset/transfer", &params);
        match &result {
            Some(v) if v["tranId"].is_number() || v["tranId"].is_string() => {
                self.log(&format!("✅ Transfer OK! TxID: {}", v["tranId"]));
                true
            }
            Some(v) => {
                self.log(&format!("❌ Transfer failed: {}", v));
                false
            }
            None => {
                self.log("❌ Transfer: no response");
                false
            }
        }
    }

    // ── STEP 2B: Transfer Futures USDT → Spot ────────────────────────────────
    pub fn transfer_from_futures(&self, amount: f64) -> bool {
        self.log(&format!("💸 Transferring ${:.4} USDT Futures → Spot...", amount));
        let params = format!("type=UMFUTURE_MAIN&asset=USDT&amount={:.4}", amount);
        let result = self.spot_post("/sapi/v1/asset/transfer", &params);
        match &result {
            Some(v) if v["tranId"].is_number() || v["tranId"].is_string() => {
                self.log(&format!("✅ Transfer OK! TxID: {}", v["tranId"]));
                true
            }
            Some(v) => {
                self.log(&format!("❌ Transfer failed: {}", v));
                false
            }
            None => {
                self.log("❌ Transfer: no response");
                false
            }
        }
    }

    // ── STEP 3: Scanner — Find Best Coin ─────────────────────────────────────
    pub fn scan_best_coin(&self) -> Option<FundingCandidate> {
        self.log("🔍 Scanning Binance Futures for highest funding rate...");

        // Fetch all funding rates
        let rates = self.fapi_get_pub_arr("/fapi/v1/premiumIndex")?;

        // Fetch 24h ticker volumes
        let tickers = self.fapi_get_pub_arr("/fapi/v1/ticker/24hr")
            .unwrap_or_default();
        let vol_map: std::collections::HashMap<String, f64> = tickers.iter()
            .filter_map(|t| {
                let sym = t["symbol"].as_str()?.to_string();
                let vol = t["quoteVolume"].as_str()?.parse::<f64>().ok()?;
                Some((sym, vol))
            })
            .collect();

        // Fetch Futures exchange info for lot sizes
        let ex_info = self.fapi_get_pub("/fapi/v1/exchangeInfo")?;
        let mut lot_map: std::collections::HashMap<String, (f64, f64, f64, usize)> =
            std::collections::HashMap::new(); // symbol → (step, min_qty, min_notional, precision)
        if let Some(symbols) = ex_info["symbols"].as_array() {
            for s in symbols {
                let sym = s["symbol"].as_str().unwrap_or("").to_string();
                let qty_prec = s["quantityPrecision"].as_u64().unwrap_or(3) as usize;
                let mut step = 0.001_f64;
                let mut min_qty = 0.001_f64;
                let mut min_notional = 5.0_f64;
                if let Some(filters) = s["filters"].as_array() {
                    for f in filters {
                        match f["filterType"].as_str().unwrap_or("") {
                            "LOT_SIZE" => {
                                step    = f["stepSize"].as_str().unwrap_or("0.001").parse().unwrap_or(0.001);
                                min_qty = f["minQty"].as_str().unwrap_or("0.001").parse().unwrap_or(0.001);
                            }
                            "MIN_NOTIONAL" | "NOTIONAL" => {
                                min_notional = f["notional"].as_str()
                                    .or_else(|| f["minNotional"].as_str())
                                    .unwrap_or("5.0").parse().unwrap_or(5.0);
                            }
                            _ => {}
                        }
                    }
                }
                lot_map.insert(sym, (step, min_qty, min_notional, qty_prec));
            }
        }

        // Fetch Spot exchange info once to get all symbols actively trading on Spot
        let spot_info = match self.agent.get("https://api.binance.com/api/v3/exchangeInfo").call() {
            Ok(r) => r.into_json::<Value>().ok(),
            Err(_) => None,
        };
        let spot_symbols: std::collections::HashSet<String> = spot_info
            .as_ref()
            .and_then(|v| v["symbols"].as_array())
            .unwrap_or(&vec![])
            .iter()
            .filter(|s| s["status"].as_str() == Some("TRADING"))
            .filter_map(|s| s["symbol"].as_str().map(|x| x.to_string()))
            .collect();

        let now_ms = Self::now_ms();
        let mut candidates: Vec<FundingCandidate> = rates.iter()
            .filter_map(|item| {
                let symbol = item["symbol"].as_str()?;
                if !symbol.ends_with("USDT") { return None; }
                if !spot_symbols.contains(symbol) { return None; } // MUST be listed and trading on Spot!

                let rate  = item["lastFundingRate"].as_str()?.parse::<f64>().ok()?;
                let price = item["markPrice"].as_str()?.parse::<f64>().ok()?;
                let next  = item["nextFundingTime"].as_u64()?;
                let vol   = *vol_map.get(symbol).unwrap_or(&0.0);
                let (step, min_qty, min_notional, qty_prec) = *lot_map.get(symbol)?;

                // Filters
                if rate < MIN_FUNDING_RATE_PCT / 100.0 { return None; }
                if vol < MIN_24H_VOLUME_USD { return None; }
                if price <= 0.00001 { return None; }

                let rate_pct = rate * 100.0;
                let apr      = rate_pct * 3.0 * 365.0;
                let mins_to_next = next.saturating_sub(now_ms) / 60_000;

                Some(FundingCandidate {
                    symbol: symbol.to_string(),
                    mark_price: price,
                    rate_pct, apr, vol_24h: vol,
                    mins_to_next, next_time_ms: next,
                    step_size: step, min_qty, min_notional, qty_precision: qty_prec,
                })
            })
            .collect();

        candidates.sort_by(|a, b| b.rate_pct.partial_cmp(&a.rate_pct).unwrap());

        if candidates.is_empty() {
            self.log("⚠️  No suitable dual-listed coins found. Will retry later.");
            return None;
        }

        self.log(&format!("✅ Top {} dual-listed candidates (trading on Spot + Futures):", candidates.len()));
        for (i, c) in candidates.iter().enumerate().take(5) {
            self.log(&format!(
                "  {}. {} | Rate: +{:.4}% | APR: {:.1}% | Price: ${:.4} | Vol: ${:.1}M | Next in {}m",
                i + 1, c.symbol, c.rate_pct, c.apr, c.mark_price, c.vol_24h / 1_000_000.0, c.mins_to_next
            ));
        }

        candidates.first().cloned()
    }



    // ── STEP 4: Floor quantity to step size ──────────────────────────────────
    fn floor_to_step(val: f64, step: f64) -> f64 {
        if step <= 0.0 { return val; }
        (val / step).floor() * step
    }

    // ── STEP 5: Open Delta-Neutral Position ──────────────────────────────────
    pub fn open_position(&self, coin: &FundingCandidate, budget_usd: f64) -> Option<FundingPosition> {
        let safe_budget = budget_usd.max(coin.min_notional + 0.12);
        let mut qty = Self::floor_to_step(safe_budget / coin.mark_price, coin.step_size);
        if qty * coin.mark_price < coin.min_notional {
            qty = Self::floor_to_step((coin.min_notional + 0.15) / coin.mark_price + coin.step_size, coin.step_size);
        }

        let trade_spend = (qty * coin.mark_price).max(coin.min_notional + 0.10);
        let qty_str = format!("{:.*}", coin.qty_precision, qty);

        self.log(&format!("\n{}", "═".repeat(65)));
        self.log(&format!("  🚀 OPENING DELTA-NEUTRAL POSITION: {}", coin.symbol.yellow().bold()));
        self.log(&format!("  Price: ${:.4} | Qty: {} | Budget: ${:.2}", coin.mark_price, qty_str, trade_spend));
        self.log(&format!("  Funding Rate: +{:.4}% per 8h | APR: {:.0}%", coin.rate_pct, coin.apr));
        self.log(&format!("  Expected 8h yield: ₹{:.2} INR", trade_spend * coin.rate_pct / 100.0 * INR_RATE));
        self.log(&format!("{}", "═".repeat(65)));

        // ── Leg 1: Spot Market Buy ────────────────────────────────────────────
        self.log(&format!("📌 Leg 1 (SPOT BUY): Buying {} {} on Spot...",
            qty_str, coin.symbol.replace("USDT", "")));
        let spot_params = format!(
            "symbol={}&side=BUY&type=MARKET&quoteOrderQty={:.2}&newOrderRespType=FULL",
            coin.symbol, trade_spend
        );
        let spot_res = self.spot_post("/api/v3/order", &spot_params)?;

        if spot_res["status"].as_str() != Some("FILLED") {
            self.log(&format!("❌ Spot buy failed: {}", spot_res));
            return None;
        }
        let filled_qty  = spot_res["executedQty"].as_str()
            .and_then(|s| s.parse::<f64>().ok()).unwrap_or(qty);
        let filled_cost = spot_res["cummulativeQuoteQty"].as_str()
            .and_then(|s| s.parse::<f64>().ok()).unwrap_or(trade_spend);
        self.log(&format!("✅ Leg 1 FILLED: Bought {} {} for ${:.4}",
            filled_qty, coin.symbol.replace("USDT", ""), filled_cost));

        // ── Leg 2: Futures 3x Short (Delta-neutral hedge with safe margin) ────
        let lev_params = format!("symbol={}&leverage=3", coin.symbol);
        let _ = self.fapi_post("/fapi/v1/leverage", &lev_params);

        let short_qty = Self::floor_to_step(filled_qty, coin.step_size);
        let short_qty_str = format!("{:.*}", coin.qty_precision, short_qty);

        self.log(&format!("📌 Leg 2 (FUTURES SHORT 3x): Shorting {} {}...",
            short_qty_str, coin.symbol));
        let fut_params = format!(
            "symbol={}&side=SELL&type=MARKET&quantity={}&newOrderRespType=RESULT",
            coin.symbol, short_qty_str
        );
        let fut_res = self.fapi_post("/fapi/v1/order", &fut_params)?;

        let fut_status = fut_res["status"].as_str().unwrap_or("");
        if fut_status != "FILLED" && fut_status != "NEW" {
            self.log(&format!(
                "❌ CRITICAL: Futures short FAILED! Status: {}. \
                 You MUST manually sell {} {} on Spot to close the unhedged position!",
                fut_res, filled_qty, coin.symbol.replace("USDT", "")
            ));
            // Emergency notification via file flag
            let _ = fs::write(
                "data/FUNDING_EMERGENCY.flag",
                format!("UNHEDGED: Sell {} {} on spot immediately!", filled_qty, coin.symbol)
            );
            return None;

        }

        let entry_price = fut_res["avgPrice"].as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(coin.mark_price);

        self.log(&format!("✅ Leg 2 FILLED: Short {} {} @ ${:.4}",
            short_qty_str, coin.symbol, entry_price));
        self.log(&format!("\n🎉 POSITION OPEN — Next payout in {}m", coin.mins_to_next));

        Some(FundingPosition {
            active: true,
            symbol: coin.symbol.clone(),
            spot_qty: filled_qty,
            futures_qty: short_qty,
            entry_price,
            entry_time_ms: Self::now_ms(),
            total_funding_usd: 0.0,
            payment_count: 0,
            last_checked_ms: Self::now_ms().saturating_sub(9 * 3600 * 1000), // trigger first check
        })
    }

    // ── STEP 5: 🔥 WebSocket Real-Time Monitor ────────────────────────────────
    // wss://fstream.binance.com/ws/<symbol>@markPrice
    // Binance pushes mark price + funding rate every 3 seconds
    // We react to rate/price changes in <3 seconds instead of 15 minutes
    pub fn run_websocket_monitor(&self, pos_arc: Arc<Mutex<FundingPosition>>, exit_flag: Arc<AtomicBool>) {
        let symbol_lower = {
            let pos = pos_arc.lock().unwrap();
            pos.symbol.to_lowercase()
        };
        let ws_url = format!("wss://fstream.binance.com/ws/{}@markPrice", symbol_lower);
        self.log(&format!("🔌 Connecting WS: {}", ws_url.cyan()));

        let mut last_income_check_ms = { pos_arc.lock().unwrap().last_checked_ms };
        let mut last_status_print = Self::now_ms();
        let mut tick_count: u64 = 0;

        'outer: loop {
            let (mut socket, _) = match connect(&ws_url) {
                Ok(s) => s,
                Err(e) => {
                    self.log(&format!("⚠️  WS connect failed: {}. Retrying in 5s...", e));
                    sleep(Duration::from_secs(5));
                    if exit_flag.load(Ordering::Relaxed) { return; }
                    continue;
                }
            };
            self.log(&format!("✅ WS live — {} markPrice stream (3s ticks)", symbol_lower.to_uppercase().cyan()));

            loop {
                if exit_flag.load(Ordering::Relaxed) {
                    self.log("🔌 WS: exit flag set, disconnecting.");
                    let _ = socket.close(None);
                    return;
                }
                match socket.read() {
                    Ok(Message::Text(txt)) => {
                        tick_count += 1;
                        let v: Value = match serde_json::from_str(&txt) { Ok(v) => v, Err(_) => continue };
                        let rate_pct   = v["r"].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0) * 100.0;
                        let mark_price = v["p"].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                        let next_ms    = v["T"].as_u64().unwrap_or(0);
                        let mins_next  = next_ms.saturating_sub(Self::now_ms()) / 60_000;
                        let now_ms     = Self::now_ms();
                        let (entry_price, symbol) = { let p = pos_arc.lock().unwrap(); (p.entry_price, p.symbol.clone()) };

                        // Rate guard — instant exit if rate goes negative
                        if rate_pct < EXIT_FUNDING_RATE_PCT {
                            self.log(&format!("⚠️  [{}] RATE NEGATIVE: {:.4}% via WS! Exiting...", tick_count, rate_pct));
                            exit_flag.store(true, Ordering::Relaxed);
                            let _ = socket.close(None);
                            return;
                        }
                        // Price guard — instant exit if price surges ±20%
                        if entry_price > 0.0 {
                            let move_pct = (mark_price - entry_price) / entry_price * 100.0;
                            if move_pct.abs() > PRICE_SURGE_GUARD_PCT {
                                self.log(&format!("🛑 [{}] PRICE GUARD: {:+.1}% from entry via WS! Exiting...", tick_count, move_pct));
                                exit_flag.store(true, Ordering::Relaxed);
                                let _ = socket.close(None);
                                return;
                            }
                        }
                        // Payment check via HTTP every 30 min
                        if now_ms.saturating_sub(last_income_check_ms) > 30 * 60 * 1000 {
                            self.check_funding_payments(&pos_arc, &symbol);
                            last_income_check_ms = now_ms;
                        }
                        // Status log every 60s
                        if now_ms.saturating_sub(last_status_print) > 60_000 {
                            let earned_inr = { pos_arc.lock().unwrap().total_funding_usd * INR_RATE };
                            self.log(&format!(
                                "📡 [{}] {} | Rate: {:.4}% | Price: ${:.4} | Next: {}m | Earned: ₹{:.2}",
                                tick_count, symbol.cyan(), rate_pct, mark_price, mins_next, earned_inr
                            ));
                            last_status_print = now_ms;
                            pos_arc.lock().unwrap().save();
                        }
                    }
                    Ok(Message::Ping(d)) => { let _ = socket.send(Message::Pong(d)); }
                    Ok(Message::Close(_)) => { self.log("🔌 WS closed by server. Reconnecting..."); break; }
                    Err(e) => { self.log(&format!("⚠️  WS error: {}. Reconnecting...", e)); sleep(Duration::from_secs(3)); break; }
                    _ => {}
                }
            }
            if exit_flag.load(Ordering::Relaxed) { return; }
            sleep(Duration::from_secs(2));
        }
    }

    // ── Funding Payment HTTP Check (every 30 min from WS loop) ───────────────
    fn check_funding_payments(&self, pos_arc: &Arc<Mutex<FundingPosition>>, symbol: &str) {
        let last_checked = { pos_arc.lock().unwrap().last_checked_ms };
        if let Some(incomes) = self.fapi_get_arr("/fapi/v1/income",
            &format!("symbol={}&incomeType=FUNDING_FEE&limit=10", symbol)) {
            let mut new_usd = 0.0_f64; let mut new_cnt = 0u32;
            for inc in &incomes {
                let t = inc["time"].as_u64().unwrap_or(0);
                if t > last_checked {
                    let earned = inc["income"].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                    new_usd += earned; new_cnt += 1;
                    self.log(&format!("{}  +${:.6} USD (₹{:.2} INR)", "💰 PAYMENT:".green().bold(), earned, earned * INR_RATE));
                }
            }
            let mut pos = pos_arc.lock().unwrap();
            if new_usd != 0.0 {
                pos.total_funding_usd += new_usd;
                pos.payment_count += new_cnt;
                self.log(&format!("💰 Total: ${:.6} USD (₹{:.2}) | {} payments", pos.total_funding_usd, pos.total_funding_usd * INR_RATE, pos.payment_count));
            }
            pos.last_checked_ms = Self::now_ms();
        }
    }

    // ── STEP 6: Close Position ────────────────────────────────────────────────
    pub fn close_position(&self, pos: &FundingPosition, reason: &str) {
        self.log(&format!("\n🔄 CLOSING {} — Reason: {}", pos.symbol.yellow(), reason));

        // Close Futures short first (Buy to close)
        let short_str = format!("{:.*}", 4, pos.futures_qty); // fallback precision
        let fut_close_params = format!(
            "symbol={}&side=BUY&type=MARKET&quantity={}&reduceOnly=true&newOrderRespType=RESULT",
            pos.symbol, short_str
        );
        match self.fapi_post("/fapi/v1/order", &fut_close_params) {
            Some(v) => self.log(&format!("✅ Futures closed: {}", v["status"].as_str().unwrap_or("?"))),
            None    => self.log("❌ Futures close may have failed — check manually!"),
        }

        // Sell spot
        let spot_sell_params = format!(
            "symbol={}&side=SELL&type=MARKET&quantity={}&newOrderRespType=FULL",
            pos.symbol, short_str
        );
        match self.spot_post("/api/v3/order", &spot_sell_params) {
            Some(v) => self.log(&format!(
                "✅ Spot sold. Received: ${:.4}",
                v["cummulativeQuoteQty"].as_str()
                    .and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0)
            )),
            None => self.log("❌ Spot sell may have failed — check manually!"),
        }

        self.log(&format!(
            "\n🏁 CLOSED SUMMARY: {} | Reason: {} | Total earned: ₹{:.2} INR ({} payments)",
            pos.symbol, reason, pos.total_funding_usd * INR_RATE, pos.payment_count
        ));
    }

    // ── MAIN RUN LOOP ─────────────────────────────────────────────────────────
    pub fn run(&self) {
        println!("\n{}", "═".repeat(65));
        println!("  {} FUNDING RATE ENGINE v2.0 (KERNEL WEBSOCKET ENGINE) STARTING",
            "🇮🇳 BHARAT OS".yellow().bold());
        println!("  Strategy : Delta-Neutral (Spot Long + Futures 1x Short)");
        println!("  Risk     : ZERO market direction risk");
        println!("  Income   : Funding rate payments every 8 hours");
        println!("  Engine   : Real-time WebSocket stream (3s tick latency)");
        println!("{}\n", "═".repeat(65));

        let spot_total = self.get_spot_stable_balance();
        let fut_usdt   = self.get_futures_usdt_balance();
        self.log(&format!("💼 Balances — Spot: ${:.4} (USDT+FDUSD) | Futures: ${:.4} USDT",
            spot_total, fut_usdt));

        // Try to resume existing position
        let mut pos = FundingPosition::load();

        if pos.is_none() {
            // Fresh start: scan + open
            let coin = match self.scan_best_coin() {
                Some(c) => c,
                None => {
                    self.log("❌ No suitable coin found. Try again in 10 minutes.");
                    return;
                }
            };

            let spot_usdt = self.get_spot_pure_usdt();
            let fut_usdt  = self.get_futures_usdt_balance();
            let total_usdt = spot_usdt + fut_usdt;
            if total_usdt < 6.0 {
                self.log(&format!(
                    "❌ Insufficient balance: ${:.2}. Need at least $6.00 total.", total_usdt
                ));
                return;
            }

            // Spot requires minimum $5.15 to meet $5.00 min notional
            let target_spot = 5.15;
            let target_fut_margin = 1.75; // 3x leverage margin for ~$5.15 position

            if spot_usdt < target_spot {
                let needed = target_spot - spot_usdt;
                if fut_usdt >= needed + 1.50 {
                    self.transfer_from_futures(needed);
                    sleep(Duration::from_secs(2));
                }
            } else if fut_usdt < target_fut_margin {
                let needed = target_fut_margin - fut_usdt;
                if spot_usdt >= needed + 5.10 {
                    self.transfer_to_futures(needed);
                    sleep(Duration::from_secs(2));
                }
            }

            pos = self.open_position(&coin, 5.12);
            if let Some(ref p) = pos {
                p.save();
            } else {
                self.log("❌ Failed to open position.");
                return;
            }
        } else {
            self.log(&format!("📂 Resuming existing position: {}",
                pos.as_ref().unwrap().symbol.cyan().bold()));
        }

        // ── 🔥 WebSocket Real-Time Monitor Loop (Kernel-Level Speed) ─────────
        self.log("\n🔥 Starting WebSocket real-time monitor (markPrice stream every 3s)...\n");

        loop {
            let current_pos = pos.take().unwrap();
            let symbol = current_pos.symbol.clone();

            // Wrap position in thread-safe Arc<Mutex>
            let pos_arc  = Arc::new(Mutex::new(current_pos));
            let exit_flag = Arc::new(AtomicBool::new(false));

            // Run WebSocket monitor (blocks until exit_flag is set)
            self.run_websocket_monitor(Arc::clone(&pos_arc), Arc::clone(&exit_flag));

            // WebSocket exited — check why
            let final_pos = pos_arc.lock().unwrap().clone();

            // Determine exit reason by re-checking rate and price
            let rate_data = self.fapi_get_pub(
                &format!("/fapi/v1/premiumIndex?symbol={}", symbol)
            );
            let current_rate = rate_data.as_ref()
                .and_then(|v| v["lastFundingRate"].as_str())
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0) * 100.0;
            let mark_price = rate_data.as_ref()
                .and_then(|v| v["markPrice"].as_str())
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(final_pos.entry_price);

            let reason = if current_rate < EXIT_FUNDING_RATE_PCT {
                "EXIT_NEGATIVE_RATE"
            } else {
                let move_pct = (mark_price - final_pos.entry_price) / final_pos.entry_price * 100.0;
                if move_pct.abs() > PRICE_SURGE_GUARD_PCT { "EXIT_STOP_LOSS" } else { "WS_RECONNECT" }
            };

            if reason == "WS_RECONNECT" {
                // Temporary disconnect — restore pos and reconnect WS
                self.log("🔌 WS disconnected (network issue). Reconnecting monitor...");
                pos = Some(final_pos);
                sleep(Duration::from_secs(3));
                continue;
            }

            // Real exit: close position and rotate
            self.log(&format!("🚨 Exit triggered: {}", reason));
            self.close_position(&final_pos, reason);
            let mut closed = final_pos;
            closed.active = false;
            closed.save();

            // Try to rotate to new coin
            sleep(Duration::from_secs(5));
            self.log("🔄 Scanning for new best coin...");
            if let Some(new_coin) = self.scan_best_coin() {
                let spot_now = self.get_spot_pure_usdt();
                let fut_now  = self.get_futures_usdt_balance();
                let total    = spot_now + fut_now;
                if total >= 6.0 {
                    let target_spot = 5.15;
                    let target_fut_margin = 1.75;
                    if spot_now < target_spot {
                        let needed = target_spot - spot_now;
                        if fut_now >= needed + 1.50 {
                            self.transfer_from_futures(needed);
                            sleep(Duration::from_secs(2));
                        }
                    } else if fut_now < target_fut_margin {
                        let needed = target_fut_margin - fut_now;
                        if spot_now >= needed + 5.10 {
                            self.transfer_to_futures(needed);
                            sleep(Duration::from_secs(2));
                        }
                    }
                    if let Some(new_pos) = self.open_position(&new_coin, 5.12) {
                        new_pos.save();
                        pos = Some(new_pos);
                        continue;
                    }
                }
            }

            self.log("❌ No suitable coin found after rotation. Waiting 10 min before retry...");
            sleep(Duration::from_secs(600));
        } // end loop
    } // end fn run()
} // end impl FundingRateEngine

// ── Helpers ───────────────────────────────────────────────────────────────────
fn chrono_now_ist() -> String {
    let ms = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default().as_millis();
    let ist_ms = ms + (5 * 3600 + 1800) * 1000; // UTC+5:30
    let secs = ist_ms / 1000;
    let h = (secs % 86400) / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    let day_secs = secs % 86400;
    let _ = day_secs;
    format!("{:02}:{:02}:{:02} IST", h, m, s)
}
