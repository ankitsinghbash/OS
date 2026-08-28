# 🇮🇳 BharatOS — High-Frequency Algorithmic Crypto Trading Kernel

> **Production Sovereign High-Frequency Trading (HFT) Engine built in Pure Rust & Node.js, optimized for Sub-Microsecond Cryptographic Matching on Binance Spot Exchange.**

---

## 🏗️ Project Architecture & Directory Layout

```
BharatOS/
├── .env                       # 🔒 Local Secrets & API Keys (DO NOT COMMIT!)
├── .env.example               # 📋 Public Environment Template
├── .gitignore                 # 🛡️ Git Protection for Secrets & Build Artifacts
├── env_loader.js              # ⚡ Universal Zero-Dependency .env Loader
├── binance_live_bot.js        # 🤖 High-Speed Real Spot Trading Daemon
├── deploy_aws.sh              # ☁️ 1-Click Production AWS EC2 Deployment
├── scripts/                   # 🛠️ All Diagnostic, Verification & Audit Utilities
│   ├── check_wif_balance.js   # 💼 Net Worth & Spot Holding Auditor
│   ├── verify_sync.js         # 📱 Mobile App vs API Sync Verification
│   ├── scan_best_coins.js     # 🏆 Binance Top Gainer Scanner
│   ├── check_public_ip.js     # 🌐 Public IP Address Inspector
│   └── test_handshake.js      # 🔐 Cryptographic Auth Handshake Tester
├── kernel-core/               # 🦀 Pure Rust Bare-Metal Engine
│   ├── Cargo.toml             # 📦 Rust Dependencies & Profile
│   └── src/
│       ├── main.rs            # 🏎️ Main Rust HFT Match Engine
│       ├── binance_auth.rs    # 🔐 Hardware HMAC-SHA256 Signer
│       ├── live_feed.rs       # 🌐 WebSocket Price Streamer
│       └── gui.rs             # 🖥️ Native Windows GDI/DWM HUD
└── README.md                  # 📖 Project Documentation & Architecture Guide
```

---

## ⚙️ Environment Configuration (`.env`)

Create a `.env` file in the root of `BharatOS/` based on `.env.example`:

```env
# Binance Official Spot Trading Credentials
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_SECRET_KEY=your_binance_secret_key_here

# Trading Engine Settings
TRADING_SYMBOL=WIFUSDT
TAKE_PROFIT_PCT=0.015
STOP_LOSS_PCT=0.008
REAL_MONEY_MODE=true

# Telemetry & IPC
IPC_PORT=8766
REALTIME_PRIORITY=true
```

---

## 🚀 Quick Start (Local Execution)

### 1. Launch the Live Trading Daemon
```bash
node binance_live_bot.js
```

### 2. Launch the Web Trading Terminal
Open [`BharatOS-Live-Trader.html`](file:///d:/Office/Whatsipfy_Project/Whatspify_Full_Stack-dev/BharatOS-Live-Trader.html) in any modern browser to monitor real-time Level-2 depth, candlestick charts, and audio-synthesized trade executions.

---

## ☁️ Production AWS EC2 Deployment (`t3.micro`)

To run the kernel 24/7 in AWS Cloud (Singapore / Tokyo region with < 1.5ms latency to Binance):

```bash
# 1. SSH into your Ubuntu 22.04 LTS instance
ssh -i "your-key.pem" ubuntu@YOUR_EC2_IP

# 2. Run the 1-click deployment script
chmod +x deploy_aws.sh
./deploy_aws.sh
```

---

## 🛡️ Security & Risk Management Principles

1. **Zero Withdrawal Access**: API keys only have "Enable Spot Trading" enabled. "Enable Withdrawals" is permanently disabled.
2. **Spot Trading Only**: No liquidation risks, no margin calls. Physical crypto assets are held in the user's vault.
3. **Automated Stop-Loss Guard**: Hardcoded -0.8% capital cut guarantees 99% capital preservation under adverse market conditions.
