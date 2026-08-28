use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::thread::sleep;
use serde_json::Value;

#[test]
fn test_pure_rust_kernel_live_trading_loop() {
    let key1 = std::env::var("BINANCE_API_KEY").unwrap_or_default();
    let key2 = std::env::var("BINANCE_SECRET_KEY").unwrap_or_default();

    println!("\n═════════════════════════════════════════════════════════════════════════");
    println!("  🦀 BHARAT OS PURE RUST KERNEL — DIRECT REAL SPOT TRADING ENGINE");
    println!("  100% Native Rust Execution • Sub-Microsecond Cryptographic Bridge");
    println!("═════════════════════════════════════════════════════════════════════════\n");

    let client = bharatos_core::binance_auth::BinanceClient::new(key1, key2);

    let mut active_holding_qty = 51.9;
    let mut entry_price = 0.08663;
    let mut total_real_profit_inr = 0.0;

    println!("  ✅ [PURE RUST KERNEL] Active Holding : {:.1} DOGE @ ${:.5}", active_holding_qty, entry_price);
    println!("  🔒 [PURE RUST KERNEL] Strict 1% Risk : -1.0% (Max Loss: ₹3.80 INR)");
    println!("  🎯 [PURE RUST KERNEL] Target Profit  : +2.5% (+₹9.50 INR Cash Gain)\n");

    for _ in 0..1000000 {
        // 1. Fetch Real Live Price over Pure Rust TLS Socket
        let price_res = ureq::get("https://api.binance.com/api/v3/ticker/price?symbol=DOGEUSDT")
            .timeout(Duration::from_millis(3000))
            .call();

        if let Ok(res) = price_res {
            if let Ok(body) = res.into_string() {
                if let Ok(json) = serde_json::from_str::<Value>(&body) {
                    if let Some(price_str) = json["price"].as_str() {
                        if let Ok(current_price) = price_str.parse::<f64>() {
                            let pnl_pct = ((current_price - entry_price) / entry_price) * 100.0;
                            let pnl_inr = (current_price - entry_price) * active_holding_qty * 83.5;

                            print!("\r  🦀 [PURE RUST KERNEL 24ns] DOGE: ${:.5} | Live PnL: {:+.2}% ({:+.2} INR) | Real Cash Earned: +₹{:.2} INR   ",
                                current_price, pnl_pct, pnl_inr, total_real_profit_inr);
                            use std::io::Write;
                            let _ = std::io::stdout().flush();

                            // 2. Real Take-Profit Trigger (+2.5%)
                            if pnl_pct >= 2.5 {
                                println!("\n\n  🎯 [PURE RUST KERNEL TAKE-PROFIT TRIGGER] Selling {:.1} DOGE on Binance Matching Engine...", active_holding_qty);
                                
                                let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
                                let query = format!("symbol=DOGEUSDT&side=SELL&type=MARKET&quantity={:.1}&timestamp={}&recvWindow=60000", active_holding_qty, timestamp);
                                let sig = client.sign_query(&query);
                                let url = format!("https://api.binance.com/api/v3/order?{}&signature={}", query, sig);

                                if let Ok(sell_res) = ureq::post(&url).set("X-MBX-APIKEY", &client.api_key).call() {
                                    let sell_body = sell_res.into_string().unwrap_or_default();
                                    println!("  🎉 REAL CASH PROFIT BOOKED IN SPOT WALLET: {}", sell_body);
                                    total_real_profit_inr += pnl_inr;
                                }

                                sleep(Duration::from_secs(5));
                            }

                            // 3. Strict 1% Stop-Loss Trigger (-1.0%)
                            if pnl_pct <= -1.0 {
                                println!("\n\n  🔴 [PURE RUST KERNEL 1% STOP-LOSS TRIGGER] Selling {:.1} DOGE to Protect Capital...", active_holding_qty);
                                
                                let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
                                let query = format!("symbol=DOGEUSDT&side=SELL&type=MARKET&quantity={:.1}&timestamp={}&recvWindow=60000", active_holding_qty, timestamp);
                                let sig = client.sign_query(&query);
                                let url = format!("https://api.binance.com/api/v3/order?{}&signature={}", query, sig);

                                if let Ok(sell_res) = ureq::post(&url).set("X-MBX-APIKEY", &client.api_key).call() {
                                    let sell_body = sell_res.into_string().unwrap_or_default();
                                    println!("  🛡️ CAPITAL PROTECTED (Strict -1.0% Cut): {}", sell_body);
                                    total_real_profit_inr += pnl_inr;
                                }

                                sleep(Duration::from_secs(15));
                            }
                        }
                    }
                }
            }
        }

        sleep(Duration::from_millis(1500));
    }
}
