#!/bin/bash
# ═════════════════════════════════════════════════════════════════════════
# 🇮🇳 BHARAT OS — HIGH-SPEED SOVEREIGN TRADING KERNEL AWS DEPLOYMENT SCRIPT
# Target: AWS EC2 (Ubuntu 22.04 / 24.04 LTS or Amazon Linux)
# Optimized for Ultra-Low Latency & 24/7 Automated Cloud Execution
# ═════════════════════════════════════════════════════════════════════════

set -e

echo "========================================================================="
echo "  🚀 INITIALIZING BHARAT OS KERNEL DEPLOYMENT ON AWS EC2 CLOUD"
echo "========================================================================="

# 1. Setup 2GB Fast Swap File (Prevents OOM Crashes on 1GB RAM)
echo "🛡️ 1/6. Creating 2GB Swap Protection (Zero-Crash Guarantee)..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 2. Update System Packages
echo "📦 2/6. Updating system packages & installing build tools..."
sudo apt-get update -y
sudo apt-get install -y curl build-essential git libssl-dev pkg-config ufw htop

# 2. Install Node.js LTS (v20)
echo "⚡ 2/5. Installing Node.js LTS & PM2 Supervisor..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# 3. Install Rust Toolchain (for Pure Rust Kernel Engine)
echo "🦀 3/5. Installing Rust Bare-Metal Compiler Toolchain..."
if ! command -v cargo &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# 4. Apply Linux Kernel Network & CPU Performance Optimizations (Bare-Metal)
echo "🏎️ 4/5. Applying Linux Kernel HFT Network Tuning (TCP BBR & Zero-Lag)..."
sudo bash -c 'cat << EOF >> /etc/sysctl.conf
# BharatOS HFT Kernel Network Tuning
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_fastopen = 3
net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq
net.ipv4.tcp_notsent_lowat = 16384
EOF'
sudo sysctl -p

# 5. Setup PM2 Daemon Service for 24/7 Non-Stop Execution
echo "🛡️ 5/5. Starting BharatOS 24/7 Cloud Trading Daemon..."
pm2 delete bharatos-trader || true
pm2 start binance_live_bot.js --name "bharatos-trader" --restart-delay=3000 --max-restarts=50
pm2 save
pm2 startup | tail -n 1 | bash || true

echo "========================================================================="
echo "  🎉 BHARAT OS KERNEL IS NOW LIVE 24/7 ON AWS CLOUD!"
echo "  • Status Check : pm2 status"
echo "  • Live Logs    : pm2 logs bharatos-trader"
echo "  • Stop Bot     : pm2 stop bharatos-trader"
echo "========================================================================="
