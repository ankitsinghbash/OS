#!/bin/bash
set -e

echo "========================================================================="
echo "  🚀 DEPLOYING BHARAT OS ULTRA-HFT KERNEL ON TOKYO NODE (136.110.93.222)"
echo "========================================================================="

# 1. Update Packages & Dependencies
sudo apt-get update -y
sudo apt-get install -y curl git build-essential pkg-config libssl-dev htop ufw

# 2. Install Node.js v20 LTS & PM2
if ! command -v node &> /dev/null; then
    echo "Installing Node.js LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 Supervisor..."
    sudo npm install -g pm2
fi

# 3. Install Rust Toolchain
if ! command -v cargo &> /dev/null; then
    echo "Installing Rust Bare-Metal Toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# 4. Linux Kernel HFT Network Tuning (TCP BBR & Zero-Lag)
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
sudo sysctl -p || true

echo "========================================================================="
echo "  ✅ TOKYO HFT NODE ENVIRONMENT FULLY INITIALIZED!"
echo "========================================================================="
