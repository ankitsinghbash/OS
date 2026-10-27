//! ═══════════════════════════════════════════════════════════════════════════
//! 🇮🇳 BHARAT OS PURE RUST KERNEL — ENTERPRISE SWING TRADING ENGINE v0.4.0
//! Multi-Timeframe (1H Trend + 15m RSI) • Dynamic Filters • Zero Overtrading
//! ═══════════════════════════════════════════════════════════════════════════

#[cfg(windows)]
mod display;
#[cfg(windows)]
mod power;
#[cfg(windows)]
mod memory;
#[cfg(windows)]
mod process;
#[cfg(windows)]
mod storage;
#[cfg(windows)]
mod network;
#[cfg(windows)]
mod security;
mod ipc;
#[cfg(windows)]
mod stress;
#[cfg(windows)]
mod gui;
mod hft;
mod algo_trader;
mod paper_trader;
mod live_feed;
#[cfg(windows)]
mod ipc_server;
mod binance_auth;
mod live_real_trader;

use std::time::{Duration, Instant};
use std::thread::sleep;
use colored::*;
use serde_json::Value;
use binance_auth::{BinanceClient, SymbolRules};

#[derive(Debug, PartialEq, Clone)]
enum PositionState {
    HoldingAsset(String),
    UsdtCash,
}

// ── 🛡️ INSTITUTIONAL SWING PARAMETERS ─────────────────────────────────────────
const COOLDOWN_SECS: u64 = 60 * 60;        // 1 Hour Hard Cooldown Between Trades
const DEEP_DIP_OVERRIDE_PCT: f64 = 0.025;  // -2.5% Flash Dip can bypass cooldown
const TAKE_PROFIT_PCT: f64 = 0.035;        // +3.5% Swing Take-Profit Target
const BREAKEVEN_TRIGGER_PCT: f64 = 0.018;  // +1.8% Profit moves Stop to Entry + 0.3%
const STOP_LOSS_BASE_PCT: f64 = 0.015;     // -1.5% Strict Support Stop-Loss
const MAX_DAILY_TRADES: u32 = 2;           // Max 2 Disciplined Trades per 24 Hours

/// Calculate Exponential Moving Average (EMA)
fn compute_ema(prices: &[f64], period: usize) -> f64 {
    if prices.is_empty() { return 0.0; }
    let k = 2.0 / (period as f64 + 1.0);
    let mut ema = prices[0];
    for &p in &prices[1..] {
        ema = (p * k) + (ema * (1.0 - k));
    }
    ema
}

/// Calculate Relative Strength Index (RSI - 14 period Wilder's Smoothing)
fn compute_rsi(prices: &[f64], period: usize) -> f64 {
    if prices.len() <= period { return 50.0; }
    let mut gains = 0.0;
    let mut losses = 0.0;

    for i in 1..=period {
        let diff = prices[i] - prices[i - 1];
        if diff >= 0.0 { gains += diff; } else { losses += diff.abs(); }
    }

    let mut avg_gain = gains / period as f64;
    let mut avg_loss = losses / period as f64;

    for i in (period + 1)..prices.len() {
        let diff = prices[i] - prices[i - 1];
        let (gain, loss) = if diff >= 0.0 { (diff, 0.0) } else { (0.0, diff.abs()) };
        avg_gain = ((avg_gain * (period - 1) as f64) + gain) / period as f64;
        avg_loss = ((avg_loss * (period - 1) as f64) + loss) / period as f64;
    }

    if avg_loss == 0.0 { return 100.0; }
    let rs = avg_gain / avg_loss;
    100.0 - (100.0 / (1.0 + rs))
}

/// Multi-Timeframe Trend & RSI Pullback Analyzer
fn analyze_swing_setup(symbol: &str) -> (bool, f64, f64, f64, bool) {
    // 1. Fetch 1-Hour Klines for Macro Structure (EMA 20 vs EMA 50)
    let url_1h = format!("https://api.binance.com/api/v3/klines?symbol={}&interval=1h&limit=55", symbol);
    let closes_1h: Vec<f64> = match ureq::get(&url_1h).timeout(Duration::from_millis(4000)).call() {
        Ok(res) => {
            let body = res.into_string().unwrap_or_default();
            let json: Value = serde_json::from_str(&body).unwrap_or_default();
            json.as_array().map(|arr| {
                arr.iter().filter_map(|c| c.get(4).and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok())).collect()
            }).unwrap_or_default()
        }
        Err(_) => Vec::new()
    };

    let (is_1h_bullish, ema20_1h, ema50_1h) = if closes_1h.len() >= 50 {
        let e20 = compute_ema(&closes_1h, 20);
        let e50 = compute_ema(&closes_1h, 50);
        (e20 >= e50, e20, e50)
    } else {
        (true, 0.0, 0.0)
    };

    // 2. Fetch 15-Minute Klines for Pullback RSI
    let url_15m = format!("https://api.binance.com/api/v3/klines?symbol={}&interval=15m&limit=30", symbol);
    let closes_15m: Vec<f64> = match ureq::get(&url_15m).timeout(Duration::from_millis(4000)).call() {
        Ok(res) => {
            let body = res.into_string().unwrap_or_default();
            let json: Value = serde_json::from_str(&body).unwrap_or_default();
            json.as_array().map(|arr| {
                arr.iter().filter_map(|c| c.get(4).and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok())).collect()
            }).unwrap_or_default()
        }
        Err(_) => Vec::new()
    };

    let rsi_15m = if closes_15m.len() >= 15 {
        compute_rsi(&closes_15m, 14)
    } else {
        50.0
    };

    // Dip Entry Trigger: 1H Trend is Bullish AND 15M RSI is in healthy dip/pullback zone (28 to 48)
    let is_dip_confirmed = is_1h_bullish && rsi_15m <= 48.0 && rsi_15m >= 28.0;

    (is_1h_bullish, ema20_1h, ema50_1h, rsi_15m, is_dip_confirmed)
}

fn load_env_file() {
    if let Ok(content) = std::fs::read_to_string(".env") {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') { continue; }
            if let Some((k, v)) = trimmed.split_once('=') {
                std::env::set_var(k.trim(), v.trim());
            }
        }
    }
}

fn main() {
    load_env_file();
    let key1 = std::env::var("BINANCE_API_KEY").unwrap_or_default();
    let key2 = std::env::var("BINANCE_SECRET_KEY").unwrap_or_default();
    let active_symbol = std::env::var("TRADING_SYMBOL").unwrap_or_else(|_| "SOLUSDT".to_string());

    println!("\n{}", "═════════════════════════════════════════════════════════════════════════".bright_cyan());
    println!("{}", "  🦀 BHARAT OS PURE RUST KERNEL v0.4.0 — INSTITUTIONAL SWING ENGINE     ".bright_green().bold());
    println!("{}", "  Strategy: 1H Trend + 15m RSI Pullback • +3.5% TP / -1.5% SL • Zero Fees ".bright_white());
    println!("{}", "  Target Host: Singapore GCP Node (24ns Bare-Metal Execution)             ".bright_cyan());
    println!("{}\n", "═════════════════════════════════════════════════════════════════════════".bright_cyan());

    let mut client = BinanceClient::new(&key1, &key2);

    // 1. Dynamic Symbol Rules Discovery (stepSize, minNotional, precision)
    let rules: SymbolRules = client.fetch_symbol_rules(&active_symbol);
    println!("  📋 [EXCHANGE RULES] Asset: {} | Base: {} | Min Notional: ${:.2} | Step: {} (Precision: {} decimals)",
        active_symbol.bright_yellow().bold(), rules.base_asset, rules.min_notional, rules.step_size, rules.precision_decimals);

    // 2. Initial Balances & Crash / Restart State Recovery
    let (mut usdt_balance, _) = client.get_asset_balance(&rules.quote_asset);
    let (mut base_balance, _) = client.get_asset_balance(&rules.base_asset);
    let initial_price = client.get_ticker_price(&active_symbol).unwrap_or(105.0);
    let base_usd_val = base_balance * initial_price;

    let mut state = if base_usd_val >= 4.50 {
        PositionState::HoldingAsset(active_symbol.clone())
    } else {
        PositionState::UsdtCash
    };

    let mut holding_qty = base_balance;
    let mut entry_price = initial_price;
    let mut breakeven_locked = false;
    let mut last_exit_time: Option<Instant> = None;
    let mut last_exit_price = 0.0;
    let mut daily_trades_count = 0;
    let mut last_day_reset = Instant::now();

    // If recovering an existing open position on startup, fetch last trade entry price
    if let PositionState::HoldingAsset(ref _sym) = state {
        if let Some((trade_p, trade_q, is_buy, _)) = client.get_last_trade(&active_symbol) {
            if is_buy && trade_p > 0.0 {
                entry_price = trade_p;
                holding_qty = trade_q;
                println!("  🔄 [CRASH RECOVERY] Active Position Recovered from Binance Trade Log!");
                println!("      • Recovered Entry Price: ${:.4} | Holding Qty: {:.4} {}",
                    entry_price, holding_qty, rules.base_asset);
            }
        }
    }

    let net_worth_usd = usdt_balance + (holding_qty * initial_price);
    println!("  ✅ [RUST KERNEL] State             : {:?}", state);
    println!("  💵 [RUST KERNEL] Liquid USDT Cash  : ${:.4} USD (₹{:.2} INR)", usdt_balance, usdt_balance * 83.5);
    println!("  🪙 [RUST KERNEL] Asset Holdings    : {:.4} {} (${:.2} USD)", holding_qty, rules.base_asset, base_usd_val);
    println!("  💰 [RUST KERNEL] Total Net Worth   : ${:.4} USD (₹{:.2} INR)", net_worth_usd, net_worth_usd * 83.5);
    println!("  🎯 [SWING SHIELD 1] Target Profit  : +3.5% (High-Probability Swing Gain)");
    println!("  🛡️ [SWING SHIELD 2] Support Stop   : -1.5% (Logical Support Shield)");
    println!("  🔒 [SWING SHIELD 3] Breakeven Lock : +1.8% -> Locks Stop to Entry + 0.3%");
    println!("  ⏳ [SWING SHIELD 4] Trade Guard    : 1-Hour Cooldown | Max 2 Trades / 24h\n");

    let mut tick_counter: u64 = 0;
    let mut cached_1h_bull = true;
    let mut cached_ema20 = 0.0;
    let mut cached_ema50 = 0.0;
    let mut cached_rsi = 50.0;
    let mut cached_dip_confirmed = false;
    let mut last_analysis_time = Instant::now() - Duration::from_secs(60);

    loop {
        tick_counter += 1;

        // Reset daily trade count every 24 hours
        if last_day_reset.elapsed().as_secs() >= 86400 {
            daily_trades_count = 0;
            last_day_reset = Instant::now();
        }

        // Periodic server time re-sync (every 15 minutes)
        if tick_counter % 250 == 0 {
            client.sync_server_time();
        }

        // Cache 1H & 15m Analysis (Update every 30 seconds to optimize bandwidth & rate limits)
        if last_analysis_time.elapsed().as_secs() >= 30 {
            last_analysis_time = Instant::now();
            let (b, e20, e50, rsi, dip) = analyze_swing_setup(&active_symbol);
            cached_1h_bull = b;
            cached_ema20 = e20;
            cached_ema50 = e50;
            cached_rsi = rsi;
            cached_dip_confirmed = dip;
        }

        // Fetch Live Market Ticker Price
        match client.get_ticker_price(&active_symbol) {
            Ok(current_price) => {
                match &state {
                    PositionState::HoldingAsset(sym) => {
                        let pnl_pct = ((current_price - entry_price) / entry_price) * 100.0;
                        let pnl_inr = (current_price - entry_price) * holding_qty * 83.50;

                        // SWING SHIELD 3: Dynamic Breakeven Lock (+1.8%)
                        if !breakeven_locked && pnl_pct >= BREAKEVEN_TRIGGER_PCT * 100.0 {
                            breakeven_locked = true;
                            println!("\n  🔒 {} Profit hit {:+.2}%! Stop ratcheted to Entry+0.3% (Guaranteed Green Exit)",
                                "BREAKEVEN LOCK ENGAGED:".bright_cyan().bold(), pnl_pct);
                        }

                        if tick_counter % 3 == 0 {
                            let shield_status = if breakeven_locked { "🔒 BREAKEVEN PROTECTED".bright_cyan() } else { "🛡️ -1.5% SUPPORT SHIELD".bright_yellow() };
                            println!("  📈 [SWING HOLD {}] Price: ${:.4} | PnL: {:+.2}% ({:+.2} INR) | Target: ${:.4} (+3.5%) | {}",
                                sym, current_price, pnl_pct, pnl_inr, entry_price * (1.0 + TAKE_PROFIT_PCT), shield_status);
                        }

                        // ── TAKE-PROFIT TRIGGER (+3.5%) ──────────────────
                        if pnl_pct >= TAKE_PROFIT_PCT * 100.0 {
                            println!("\n  🎯 {} Taking +3.5% profit on {} @ ${:.4}...",
                                "SWING TAKE-PROFIT HIT!".bright_green().bold(), sym, current_price);
                            
                            // Re-verify exact available free base balance
                            let (free_b, _) = client.get_asset_balance(&rules.base_asset);
                            let sellable_qty = if free_b > 0.0 { free_b } else { holding_qty };
                            
                            // Floor to stepSize precision to prevent LOT_SIZE errors
                            let factor = 10_f64.powi(rules.precision_decimals as i32);
                            let floored_qty = (sellable_qty * factor).floor() / factor;

                            match client.place_market_sell(sym, floored_qty, rules.precision_decimals) {
                                Ok(sell_resp) => {
                                    println!("  🎉 {} {}", "SWING CASH PROFIT BOOKED:".bright_green().bold(), sell_resp);
                                    last_exit_time = Some(Instant::now());
                                    last_exit_price = current_price;
                                    breakeven_locked = false;
                                    state = PositionState::UsdtCash;
                                    
                                    let (new_u, _) = client.get_asset_balance(&rules.quote_asset);
                                    usdt_balance = new_u;
                                }
                                Err(err) => {
                                    println!("  ❌ Sell Order Failed: {}", err.bright_red());
                                }
                            }
                            sleep(Duration::from_secs(5));
                            continue;
                        }

                        // ── STOP-LOSS OR BREAKEVEN EXIT TRIGGER ─────────
                        let stop_threshold_pct = if breakeven_locked {
                            0.3 // Exit at +0.3% profit
                        } else {
                            -(STOP_LOSS_BASE_PCT * 100.0) // -1.5%
                        };

                        if pnl_pct <= stop_threshold_pct {
                            let exit_type = if breakeven_locked { "BREAKEVEN PROFIT EXIT" } else { "CAPITAL PROTECTION STOP-LOSS" };
                            println!("\n  🛡️ {} Selling {} @ ${:.4} (PnL: {:+.2}%)...",
                                exit_type.bright_yellow().bold(), sym, current_price, pnl_pct);
                            
                            let (free_b, _) = client.get_asset_balance(&rules.base_asset);
                            let sellable_qty = if free_b > 0.0 { free_b } else { holding_qty };
                            
                            let factor = 10_f64.powi(rules.precision_decimals as i32);
                            let floored_qty = (sellable_qty * factor).floor() / factor;

                            match client.place_market_sell(sym, floored_qty, rules.precision_decimals) {
                                Ok(sell_resp) => {
                                    println!("  🛡️ {} {}", "EXIT FILLED:".bright_yellow().bold(), sell_resp);
                                    last_exit_time = Some(Instant::now());
                                    last_exit_price = current_price;
                                    breakeven_locked = false;
                                    state = PositionState::UsdtCash;
                                    
                                    let (new_u, _) = client.get_asset_balance(&rules.quote_asset);
                                    usdt_balance = new_u;
                                }
                                Err(err) => {
                                    println!("  ❌ Exit Order Failed: {}", err.bright_red());
                                }
                            }
                            sleep(Duration::from_secs(5));
                            continue;
                        }
                    }

                    PositionState::UsdtCash => {
                        let mut cooldown_active = false;
                        let mut cooldown_rem_secs = 0;

                        if let Some(exit_t) = last_exit_time {
                            let elapsed = exit_t.elapsed().as_secs();
                            if elapsed < COOLDOWN_SECS {
                                let deep_dip_hit = last_exit_price > 0.0 && current_price <= last_exit_price * (1.0 - DEEP_DIP_OVERRIDE_PCT);
                                if !deep_dip_hit {
                                    cooldown_active = true;
                                    cooldown_rem_secs = COOLDOWN_SECS - elapsed;
                                }
                            }
                        }

                        let max_trades_reached = daily_trades_count >= MAX_DAILY_TRADES;
                        let can_enter_swing = !cooldown_active && !max_trades_reached && cached_dip_confirmed && usdt_balance >= rules.min_notional;

                        if tick_counter % 3 == 0 {
                            let trend_tag = if cached_1h_bull { "🟢 1H UPTREND".bright_green() } else { "🔴 1H DOWNTREND".bright_red() };
                            let rsi_tag = if cached_rsi <= 48.0 && cached_rsi >= 28.0 {
                                format!("🟢 15m RSI {:.1} (DIP READY)", cached_rsi).bright_green()
                            } else {
                                format!("⏳ 15m RSI {:.1} (WAITING DIP)", cached_rsi).bright_white()
                            };
                            
                            let status_msg = if cooldown_active {
                                format!("⏳ COOLDOWN ({}m rem)", cooldown_rem_secs / 60).bright_yellow()
                            } else if max_trades_reached {
                                "🛡️ MAX 2 DAILY TRADES REACHED".bright_magenta()
                            } else if can_enter_swing {
                                "🎯 HIGH-PROBABILITY SWING SETUP DETECTED".bright_green().bold()
                            } else {
                                "🛡️ CASH PROTECTED (Waiting for A+ Setup)".bright_cyan()
                            };

                            println!("  💵 [USDT CASH: ${:.2}] {} @ ${:.2} (1H EMA: ${:.1}/${:.1}) | {} | {} | {}",
                                usdt_balance, active_symbol, current_price, cached_ema20, cached_ema50, trend_tag, rsi_tag, status_msg);
                        }

                        // ── SWING BUY ENTRY TRIGGER ──────────────────────
                        if can_enter_swing {
                            let spend_usdt = (usdt_balance * 0.98 * 100.0).floor() / 100.0;
                            println!("\n  🚀 {} Entering {} with ${:.2} USDT @ ${:.4}...",
                                "INSTITUTIONAL SWING ENTRY TRIGGERED!".bright_green().bold(), active_symbol, spend_usdt, current_price);
                            
                            match client.place_market_buy(&active_symbol, spend_usdt) {
                                Ok(buy_json) => {
                                    println!("  🎉 {} {}", "SWING BUY FILLED:".bright_green().bold(), buy_json);
                                    
                                    let exec_qty = buy_json["executedQty"].as_str().unwrap_or("0.0").parse::<f64>().unwrap_or(0.0);
                                    let cumm_quote = buy_json["cummulativeQuoteQty"].as_str().unwrap_or("0.0").parse::<f64>().unwrap_or(0.0);
                                    
                                    // Query actual free balance in account to account for any commission deduction
                                    let (actual_free, _) = client.get_asset_balance(&rules.base_asset);
                                    holding_qty = if actual_free > 0.0 { actual_free } else { exec_qty };
                                    entry_price = if exec_qty > 0.0 { cumm_quote / exec_qty } else { current_price };
                                    breakeven_locked = false;
                                    daily_trades_count += 1;
                                    state = PositionState::HoldingAsset(active_symbol.clone());
                                    
                                    println!("  🎯 Active Swing Position: {:.4} {} | Entry Price: ${:.4}\n",
                                        holding_qty, active_symbol, entry_price);
                                }
                                Err(err) => {
                                    println!("  ❌ Buy Order Failed: {}", err.bright_red());
                                }
                            }
                            sleep(Duration::from_secs(5));
                            continue;
                        }
                    }
                }
            }
            Err(e) => {
                if tick_counter % 5 == 0 {
                    println!("  ⚠️ [TELEMETRY] Price fetch retry: {}", e.bright_yellow());
                }
            }
        }

        // Sleep 3.5 seconds between ticks
        sleep(Duration::from_millis(3500));
    }
}
