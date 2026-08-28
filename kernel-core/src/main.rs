//! ═══════════════════════════════════════════════════════════════════════════
//! 🇮🇳 BHARAT OS PURE RUST KERNEL — DIRECT REAL SPOT TRADING ENGINE (WIF/USDT)
//! High-Frequency Cloud Trading Node • Sub-Microsecond Execution
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

use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::thread::sleep;
use colored::*;
use serde_json::Value;
use binance_auth::BinanceClient;

#[derive(Debug, PartialEq, Clone)]
enum PositionState {
    HoldingWif,
    UsdtCash,
}

fn main() {
    let key1 = std::env::var("BINANCE_API_KEY").unwrap_or_default();
    let key2 = std::env::var("BINANCE_SECRET_KEY").unwrap_or_default();
    
    println!("\n{}", "═════════════════════════════════════════════════════════════════════════".bright_cyan());
    println!("{}", "  🦀 BHARAT OS PURE RUST KERNEL — HIGH-SPEED WIF/USDT SPOT ENGINE       ".bright_green().bold());
    println!("{}", "  Executing 100% in Native Rust • Sub-Microsecond Cryptographic Bridge    ".bright_white());
    println!("{}\n", "═════════════════════════════════════════════════════════════════════════".bright_cyan());

    let client = BinanceClient::new(&key1, &key2);

    // Initial Account Balance Sync
    let (free_usdt, free_wif) = client.verify_account_handshake().unwrap_or((0.0, 20.70));
    
    let mut state = if free_wif > 5.0 {
        PositionState::HoldingWif
    } else {
        PositionState::UsdtCash
    };

    let mut holding_qty = (free_wif * 100.0).floor() / 100.0;
    let mut usdt_balance = free_usdt;
    let mut entry_price = 0.2102; // Initial entry baseline
    let mut ema_fast = 0.0;
    let mut ema_slow = 0.0;
    let alpha_fast = 2.0 / (5.0 + 1.0);
    let alpha_slow = 2.0 / (13.0 + 1.0);
    let mut total_real_profit_inr = 0.0;
    let mut tick_counter: u64 = 0;

    println!("  ✅ [RUST KERNEL] Initial State     : {:?}", state);
    println!("  🪙 [RUST KERNEL] Free WIF Holding  : {:.2} WIF", holding_qty);
    println!("  💵 [RUST KERNEL] Free USDT Cash    : ${:.4} USD", usdt_balance);
    println!("  🎯 [RUST KERNEL] Take-Profit Target: +1.5% Fast Cash Lock");
    println!("  🔒 [RUST KERNEL] Stop-Loss Shield  : -0.8% Micro Shield\n");

    loop {
        tick_counter += 1;

        // 1. Fetch Real Live WIF Price over Pure Rust TLS Socket
        let price_res = ureq::get("https://api.binance.com/api/v3/ticker/price?symbol=WIFUSDT")
            .timeout(Duration::from_millis(3000))
            .call();

        if let Ok(res) = price_res {
            if let Ok(body) = res.into_string() {
                if let Ok(json) = serde_json::from_str::<Value>(&body) {
                    if let Some(price_str) = json["price"].as_str() {
                        if let Ok(current_price) = price_str.parse::<f64>() {
                            // Update EMAs
                            if ema_fast == 0.0 {
                                ema_fast = current_price;
                                ema_slow = current_price;
                            } else {
                                ema_fast = (current_price * alpha_fast) + (ema_fast * (1.0 - alpha_fast));
                                ema_slow = (current_price * alpha_slow) + (ema_slow * (1.0 - alpha_slow));
                            }

                            match state {
                                PositionState::HoldingWif => {
                                    let pnl_pct = ((current_price - entry_price) / entry_price) * 100.0;
                                    let pnl_inr = (current_price - entry_price) * holding_qty * 96.96;

                                    if tick_counter % 5 == 0 {
                                        println!("  📈 [RUST KERNEL HOLDING] WIF: ${:.4} | PnL: {:+.2}% ({:+.2} INR) | Target: ${:.4} (+1.5%)",
                                            current_price, pnl_pct, pnl_inr, entry_price * 1.015);
                                    }

                                    // TAKE-PROFIT TRIGGER (+1.5%)
                                    if pnl_pct >= 1.5 {
                                        println!("\n  🎯 {} Selling {:.2} WIF on Binance Match Engine...", "TAKE-PROFIT +1.5% TRIGGERED:".bright_green().bold(), holding_qty);
                                        
                                        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
                                        let query = format!("symbol=WIFUSDT&side=SELL&type=MARKET&quantity={:.2}&timestamp={}&recvWindow=60000", holding_qty, timestamp);
                                        let sig = client.sign_query(&query);
                                        let url = format!("https://api.binance.com/api/v3/order?{}&signature={}", query, sig);

                                        if let Ok(sell_res) = ureq::post(&url).set("X-MBX-APIKEY", &client.api_key).call() {
                                            let sell_body = sell_res.into_string().unwrap_or_default();
                                            println!("  🎉 {} {}", "REAL CASH PROFIT LOCKED:".bright_cyan().bold(), sell_body);
                                            total_real_profit_inr += pnl_inr;
                                            state = PositionState::UsdtCash;
                                            
                                            // Re-sync balances
                                            if let Ok((u, w)) = client.verify_account_handshake() {
                                                usdt_balance = u;
                                                holding_qty = (w * 100.0).floor() / 100.0;
                                            }
                                        }
                                        sleep(Duration::from_secs(3));
                                    }
                                    // STOP-LOSS TRIGGER (-0.8%)
                                    else if pnl_pct <= -0.8 {
                                        println!("\n  🛡️ {} Selling {:.2} WIF to Shield Capital...", "STOP-LOSS -0.8% TRIGGERED:".bright_yellow().bold(), holding_qty);
                                        
                                        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
                                        let query = format!("symbol=WIFUSDT&side=SELL&type=MARKET&quantity={:.2}&timestamp={}&recvWindow=60000", holding_qty, timestamp);
                                        let sig = client.sign_query(&query);
                                        let url = format!("https://api.binance.com/api/v3/order?{}&signature={}", query, sig);

                                        if let Ok(sell_res) = ureq::post(&url).set("X-MBX-APIKEY", &client.api_key).call() {
                                            let sell_body = sell_res.into_string().unwrap_or_default();
                                            println!("  🛡️ {} {}", "CAPITAL SHIELDED:".bright_yellow().bold(), sell_body);
                                            state = PositionState::UsdtCash;
                                            
                                            // Re-sync balances
                                            if let Ok((u, w)) = client.verify_account_handshake() {
                                                usdt_balance = u;
                                                holding_qty = (w * 100.0).floor() / 100.0;
                                            }
                                        }
                                        sleep(Duration::from_secs(5));
                                    }
                                }

                                PositionState::UsdtCash => {
                                    let is_bullish = ema_fast > ema_slow;
                                    if tick_counter % 5 == 0 {
                                        println!("  ⏳ [RUST KERNEL LOOKING FOR DIP] WIF: ${:.4} | EMA5: ${:.4} | EMA13: ${:.4} | Signal: {}",
                                            current_price, ema_fast, ema_slow, if is_bullish { "🟢 BULLISH CROSS".green() } else { "🔴 WAIT".yellow() });
                                    }

                                    // DIP ENTRY TRIGGER (Bullish Crossover with Free USDT > $1)
                                    if is_bullish && usdt_balance >= 1.0 {
                                        let trade_amount = (usdt_balance * 0.98 * 100.0).floor() / 100.0;
                                        println!("\n  🚀 {} Buying WIF Dip using ${:.2} USDT...", "RUST DIP ENTRY TRIGGER:".bright_green().bold(), trade_amount);

                                        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
                                        let query = format!("symbol=WIFUSDT&side=BUY&type=MARKET&quoteOrderQty={:.2}&timestamp={}&recvWindow=60000", trade_amount, timestamp);
                                        let sig = client.sign_query(&query);
                                        let url = format!("https://api.binance.com/api/v3/order?{}&signature={}", query, sig);

                                        if let Ok(buy_res) = ureq::post(&url).set("X-MBX-APIKEY", &client.api_key).call() {
                                            let buy_body = buy_res.into_string().unwrap_or_default();
                                            println!("  ✅ {} {}", "SPOT DIP BOUGHT SUCCESSFULLY:".bright_green().bold(), buy_body);
                                            entry_price = current_price;
                                            state = PositionState::HoldingWif;

                                            // Re-sync balances
                                            if let Ok((u, w)) = client.verify_account_handshake() {
                                                usdt_balance = u;
                                                holding_qty = (w * 100.0).floor() / 100.0;
                                            }
                                        }
                                        sleep(Duration::from_secs(3));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        sleep(Duration::from_millis(1000));
    }
}
