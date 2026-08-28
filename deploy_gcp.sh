#!/bin/bash
# ═════════════════════════════════════════════════════════════════════════
# 🇮🇳 BHARAT OS — GOOGLE CLOUD PLATFORM (GCP) DEPLOYMENT SCRIPT
# Target: GCP Compute Engine (e2-micro / e2-small / e2-medium)
# OS: Ubuntu 22.04 / Debian 11/12
# ═════════════════════════════════════════════════════════════════════════

set -e

echo "========================================================================="
echo "  🚀 INITIALIZING BHARAT OS KERNEL DEPLOYMENT ON GOOGLE CLOUD (GCP)"
echo "========================================================================="

# 1. Setup 2GB Fast Swap File (Prevents OOM Crashes on e2-micro 1GB RAM)
echo "🛡️ 1/6. Creating 2GB Swap Memory Protection..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 2. Update System Packages & Install Dependencies
echo "📦 2/6. Updating system packages & build utilities..."
sudo apt-get update -y
sudo apt-get install -y curl build-essential git libssl-dev pkg-config ufw htop

# 3. Install Node.js LTS (v20) & PM2 Process Supervisor
echo "⚡ 3/6. Installing Node.js LTS & PM2 Daemon Supervisor..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# 4. Install Rust Compiler Toolchain
echo "🦀 4/6. Installing Rust Compiler Toolchain..."
if ! command -v cargo &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# 5. Apply GCP Linux Kernel Network HFT Optimizations (TCP BBR)
echo "🏎️ 5/6. Applying High-Frequency Trading Linux Kernel Tuning..."
sudo bash -c 'cat << EOF >> /etc/sysctl.conf
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

# 6. Start PM2 Cloud Daemon Service
echo "🛡️ 6/6. Starting BharatOS 24/7 Cloud Trading Daemon on GCP..."
pm2 delete bharatos-trader || true
pm2 start binance_live_bot.js --name "bharatos-trader" --restart-delay=3000 --max-restarts=50
pm2 save
pm2 startup | tail -n 1 | bash || true

echo "========================================================================="
echo "  🎉 BHARAT OS KERNEL IS NOW LIVE 24/7 ON GOOGLE CLOUD PLATFORM!"
echo "  • Status Check : pm2 status"
echo "  • Live Logs    : pm2 logs bharatos-trader"
echo "  • Stop Bot     : pm2 stop bharatos-trader"
echo "========================================================================="
