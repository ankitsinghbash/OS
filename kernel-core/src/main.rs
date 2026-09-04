//! ═══════════════════════════════════════════════════════════════════════════
//! 🇮🇳 BHARAT OS PURE RUST KERNEL — SOVEREIGN DELTA-NEUTRAL FUNDING ENGINE
//! ═══════════════════════════════════════════════════════════════════════════
//! Strategy : Delta-Neutral (Spot Long + Futures Short 1x/3x)
//! Income   : Direct Binance Cash Funding Fee Payments Every 8 Hours
//! Risk     : ZERO Market Direction Risk (100% Hedged)
//! ═══════════════════════════════════════════════════════════════════════════

use std::fs;
use std::path::Path;
use bharatos_core::funding_rate_engine::FundingRateEngine;

fn load_env() -> (String, String) {
    let home = std::env::var("HOME").unwrap_or_default();
    let home_env = format!("{}/bharatos/.env", home);
    let paths = [
        home_env.as_str(),
        "../.env",
        ".env",
    ];
    for path in &paths {

        if Path::new(path).exists() {
            if let Ok(content) = fs::read_to_string(path) {
                let mut api_key = String::new();
                let mut secret  = String::new();
                for line in content.lines() {
                    let line = line.trim();
                    if let Some(val) = line.strip_prefix("BINANCE_API_KEY=") {
                        api_key = val.trim().to_string();
                    } else if let Some(val) = line.strip_prefix("BINANCE_SECRET_KEY=") {
                        secret = val.trim().to_string();
                    }
                }
                if !api_key.is_empty() && !secret.is_empty() {
                    println!("🔑 Loaded credentials from: {}", path);
                    return (api_key, secret);
                }
            }
        }
    }
    panic!("❌ BINANCE_API_KEY / BINANCE_SECRET_KEY not found in any .env file!");
}

fn main() {
    println!("🇮🇳 BHARAT OS SOVEREIGN ARBITRAGE KERNEL INITIALIZING...");
    let (api_key, secret_key) = load_env();
    let engine = FundingRateEngine::new(&api_key, &secret_key);
    engine.run();
}
