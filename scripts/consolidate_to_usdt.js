const crypto = require('crypto');
const https = require('https');
require('../env_loader');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function api(path, method = 'GET', params = {}) {
  return new Promise((resolve, reject) => {
    params.timestamp = Date.now();
    params.recvWindow = 60000;
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const sig = sign(qs);
    const options = {
      hostname: 'api.binance.com',
      port: 443,
      path: `${path}?${qs}&signature=${sig}`,
      method,
      headers: { 'X-MBX-APIKEY': API_KEY }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function consolidate() {
  console.log("─── Consolidating all Spot Assets to 100% Liquid USDT ───");
  const acc = await api('/api/v3/account');
  const wifBal = parseFloat(acc.balances?.find(b => b.asset === 'WIF')?.free || '0');

  if (wifBal >= 1.0) {
    const sellQty = Math.floor(wifBal * 100) / 100;
    console.log(`Selling ${sellQty} WIF to USDT...`);
    const res = await api('/api/v3/order', 'POST', {
      symbol: 'WIFUSDT',
      side: 'SELL',
      type: 'MARKET',
      quantity: sellQty.toFixed(2)
    });
    console.log("WIF Sell Result:", res);
  } else {
    console.log("No significant WIF holdings found to sell.");
  }

  // Check new USDT balance
  const updatedAcc = await api('/api/v3/account');
  const usdtBal = parseFloat(updatedAcc.balances?.find(b => b.asset === 'USDT')?.free || '0');
  console.log(`\n💰 Consolidated Pure Liquid USDT Cash: $${usdtBal.toFixed(4)} USD (₹${(usdtBal * 83.5).toFixed(2)} INR)`);
}

consolidate().catch(console.error);
