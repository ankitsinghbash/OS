//! ═══════════════════════════════════════════════════════════════════════════
//! 🇮🇳 BHARAT OS — ROBUST AUTHENTICATED BINANCE CLIENT v0.4.0
//! HMAC-SHA256 Signing • Server Time Sync • Dynamic Filters • State Recovery
//! ═══════════════════════════════════════════════════════════════════════════

use std::time::{Duration, SystemTime, UNIX_EPOCH};
use colored::*;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use serde_json::Value;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
pub struct SymbolRules {
    pub base_asset: String,
    pub quote_asset: String,
    pub step_size: f64,
    pub min_qty: f64,
    pub min_notional: f64,
    pub precision_decimals: usize,
}

impl Default for SymbolRules {
    fn default() -> Self {
        SymbolRules {
            base_asset: "SOL".to_string(),
            quote_asset: "USDT".to_string(),
            step_size: 0.001,
            min_qty: 0.001,
            min_notional: 5.0,
            precision_decimals: 3,
        }
    }
}

pub struct BinanceClient {
    pub api_key: String,
    pub secret_key: String,
    pub time_offset_ms: i64,
    agent: ureq::Agent,
}

impl BinanceClient {
    pub fn new(api_key: &str, secret_key: &str) -> Self {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(5))
            .timeout_read(Duration::from_secs(6))
            .build();

        let mut client = BinanceClient {
            api_key: api_key.to_string(),
            secret_key: secret_key.to_string(),
            time_offset_ms: 0,
            agent,
        };
        client.sync_server_time();
        client
    }

    /// Synchronize local clock offset with Binance server clock
    pub fn sync_server_time(&mut self) {
        let local_before = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64;
        if let Ok(res) = self.agent.get("https://api.binance.com/api/v3/time").call() {
            if let Ok(body) = res.into_string() {
                if let Ok(json) = serde_json::from_str::<Value>(&body) {
                    if let Some(server_time) = json["serverTime"].as_i64() {
                        let local_after = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64;
                        let local_mid = (local_before + local_after) / 2;
                        self.time_offset_ms = server_time - local_mid;
                    }
                }
            }
        }
    }

    /// Current timestamp synced with Binance server
    pub fn get_synced_timestamp(&self) -> u128 {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64;
        (now + self.time_offset_ms) as u128
    }

    /// Sign payload with HMAC-SHA256
    pub fn sign_query(&self, query_string: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(self.secret_key.as_bytes())
            .expect("HMAC accepts any key length");
        mac.update(query_string.as_bytes());
        let result = mac.finalize();
        hex::encode(result.into_bytes())
    }

    /// Fetch symbol exchange filters (stepSize, minNotional, precision)
    pub fn fetch_symbol_rules(&self, symbol: &str) -> SymbolRules {
        let url = format!("https://api.binance.com/api/v3/exchangeInfo?symbol={}", symbol);
        let mut rules = SymbolRules::default();

        if let Ok(res) = self.agent.get(&url).call() {
            if let Ok(body) = res.into_string() {
                if let Ok(json) = serde_json::from_str::<Value>(&body) {
                    if let Some(s) = json["symbols"].as_array().and_then(|arr| arr.get(0)) {
                        rules.base_asset = s["baseAsset"].as_str().unwrap_or("SOL").to_string();
                        rules.quote_asset = s["quoteAsset"].as_str().unwrap_or("USDT").to_string();

                        if let Some(filters) = s["filters"].as_array() {
                            for f in filters {
                                let f_type = f["filterType"].as_str().unwrap_or("");
                                if f_type == "LOT_SIZE" {
                                    rules.min_qty = f["minQty"].as_str().unwrap_or("0.001").parse().unwrap_or(0.001);
                                    rules.step_size = f["stepSize"].as_str().unwrap_or("0.001").parse().unwrap_or(0.001);
                                    
                                    // Calculate decimal places from stepSize
                                    let step_str = f["stepSize"].as_str().unwrap_or("0.001");
                                    if let Some(dot_pos) = step_str.find('.') {
                                        let decimals = step_str[dot_pos + 1..].trim_end_matches('0').len();
                                        rules.precision_decimals = if decimals == 0 { 0 } else { decimals };
                                    }
                                } else if f_type == "NOTIONAL" || f_type == "MIN_NOTIONAL" {
                                    rules.min_notional = f["minNotional"].as_str().unwrap_or("5.0").parse().unwrap_or(5.0);
                                }
                            }
                        }
                    }
                }
            }
        }
        rules
    }

    /// Fetch account balance for a specific asset (free, locked)
    pub fn get_asset_balance(&self, asset: &str) -> (f64, f64) {
        let timestamp = self.get_synced_timestamp();
        let query = format!("timestamp={}&recvWindow=60000", timestamp);
        let signature = self.sign_query(&query);
        let url = format!("https://api.binance.com/api/v3/account?{}&signature={}", query, signature);

        if let Ok(res) = self.agent.get(&url).set("X-MBX-APIKEY", &self.api_key).call() {
            if let Ok(body) = res.into_string() {
                if let Ok(json) = serde_json::from_str::<Value>(&body) {
                    if let Some(balances) = json["balances"].as_array() {
                        for b in balances {
                            if b["asset"] == asset {
                                let free = b["free"].as_str().unwrap_or("0.0").parse::<f64>().unwrap_or(0.0);
                                let locked = b["locked"].as_str().unwrap_or("0.0").parse::<f64>().unwrap_or(0.0);
                                return (free, locked);
                            }
                        }
                    }
                }
            }
        }
        (0.0, 0.0)
    }

    /// Legacy handshake verification
    pub fn verify_account_handshake(&self) -> Result<(f64, f64), String> {
        let (usdt, _) = self.get_asset_balance("USDT");
        let (sol, _) = self.get_asset_balance("SOL");
        Ok((usdt, sol))
    }

    /// Fetch live ticker price
    pub fn get_ticker_price(&self, symbol: &str) -> Result<f64, String> {
        let url = format!("https://api.binance.com/api/v3/ticker/price?symbol={}", symbol);
        let res = self.agent.get(&url).call().map_err(|e| format!("Ticker error: {}", e))?;
        let body = res.into_string().map_err(|e| format!("Read error: {}", e))?;
        let json: Value = serde_json::from_str(&body).map_err(|e| format!("JSON error: {}", e))?;
        let price_str = json["price"].as_str().ok_or("Missing price field")?;
        price_str.parse::<f64>().map_err(|e| format!("Parse error: {}", e))
    }

    /// Fetch last executed trade on this symbol (for crash recovery)
    pub fn get_last_trade(&self, symbol: &str) -> Option<(f64, f64, bool, u64)> {
        let timestamp = self.get_synced_timestamp();
        let query = format!("symbol={}&limit=1&timestamp={}&recvWindow=60000", symbol, timestamp);
        let signature = self.sign_query(&query);
        let url = format!("https://api.binance.com/api/v3/myTrades?{}&signature={}", query, signature);

        if let Ok(res) = self.agent.get(&url).set("X-MBX-APIKEY", &self.api_key).call() {
            if let Ok(body) = res.into_string() {
                if let Ok(trades) = serde_json::from_str::<Vec<Value>>(&body) {
                    if let Some(last) = trades.last() {
                        let price = last["price"].as_str().unwrap_or("0.0").parse::<f64>().unwrap_or(0.0);
                        let qty = last["qty"].as_str().unwrap_or("0.0").parse::<f64>().unwrap_or(0.0);
                        let is_buyer = last["isBuyer"].as_bool().unwrap_or(false);
                        let time = last["time"].as_u64().unwrap_or(0);
                        return Some((price, qty, is_buyer, time));
                    }
                }
            }
        }
        None
    }

    /// Place a cryptographically signed MARKET BUY order with quoteOrderQty
    pub fn place_market_buy(&self, symbol: &str, spend_usdt: f64) -> Result<Value, String> {
        let timestamp = self.get_synced_timestamp();
        let query = format!("symbol={}&side=BUY&type=MARKET&quoteOrderQty={:.2}&timestamp={}&recvWindow=60000",
            symbol, spend_usdt, timestamp);
        let signature = self.sign_query(&query);
        let url = format!("https://api.binance.com/api/v3/order?{}&signature={}", query, signature);

        let res = self.agent.post(&url)
            .set("X-MBX-APIKEY", &self.api_key)
            .call();

        match res {
            Ok(r) => {
                let body = r.into_string().unwrap_or_default();
                serde_json::from_str::<Value>(&body).map_err(|e| format!("JSON parse error: {}", e))
            }
            Err(ureq::Error::Status(code, r)) => {
                let err_body = r.into_string().unwrap_or_default();
                Err(format!("Binance HTTP {} Error: {}", code, err_body))
            }
            Err(e) => Err(format!("Network Error: {}", e))
        }
    }

    /// Place a cryptographically signed MARKET SELL order formatted to stepSize
    pub fn place_market_sell(&self, symbol: &str, qty_to_sell: f64, decimals: usize) -> Result<Value, String> {
        let timestamp = self.get_synced_timestamp();
        let formatted_qty = format!("{:.*}", decimals, qty_to_sell);
        
        let query = format!("symbol={}&side=SELL&type=MARKET&quantity={}&timestamp={}&recvWindow=60000",
            symbol, formatted_qty, timestamp);
        let signature = self.sign_query(&query);
        let url = format!("https://api.binance.com/api/v3/order?{}&signature={}", query, signature);

        let res = self.agent.post(&url)
            .set("X-MBX-APIKEY", &self.api_key)
            .call();

        match res {
            Ok(r) => {
                let body = r.into_string().unwrap_or_default();
                serde_json::from_str::<Value>(&body).map_err(|e| format!("JSON parse error: {}", e))
            }
            Err(ureq::Error::Status(code, r)) => {
                let err_body = r.into_string().unwrap_or_default();
                Err(format!("Binance HTTP {} Error: {}", code, err_body))
            }
            Err(e) => Err(format!("Network Error: {}", e))
        }
    }
}
