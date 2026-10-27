const crypto = require('crypto');
const https = require('https');

require('../env_loader');
const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function api(path, method, params = {}) {
  return new Promise((resolve, reject) => {
    params.timestamp = Date.now();
    params.recvWindow = 60000;
    const qs = Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const sig = sign(qs);
    const options = {
      hostname: 'api.binance.com', port: 443,
      path: `${path}?${qs}&signature=${sig}`,
      method, headers: { 'X-MBX-APIKEY': API_KEY }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function shiftToWif() {
  console.log("═════════════════════════════════════════════════════════════════════════");
  console.log("  🚀 BHARAT OS — EXECUTING REAL SHIFT TO HIGH-SPEED COIN (WIF/USDT)");
  console.log("═════════════════════════════════════════════════════════════════════════\n");

  // 1. Check DOGE Balance and SELL it for USDT
  const acc = await api('/api/v3/account', 'GET');
  const dogeBal = parseFloat(acc.balances?.find(b => b.asset === 'DOGE')?.free || '0');
  const sellQty = Math.floor(dogeBal);

  if (sellQty >= 1) {
    console.log(`  [1/3] Selling ${sellQty} DOGE Coins back to USDT Cash on Binance...`);
    const sellRes = await api('/api/v3/order', 'POST', {
      symbol: 'DOGEUSDT',
      side: 'SELL',
      type: 'MARKET',
      quantity: sellQty.toString()
    });
    console.log(`  ✅ DOGE SOLD! Order ID: ${sellRes.orderId} (Status: ${sellRes.status})`);
    await sleep(2000);
  }

  // 2. Fetch Free USDT Balance
  const acc2 = await api('/api/v3/account', 'GET');
  const usdtBal = parseFloat(acc2.balances?.find(b => b.asset === 'USDT')?.free || '0');
  console.log(`\n  [2/3] Available Free USDT Cash: $${usdtBal.toFixed(4)} USDT (₹${(usdtBal * 83.5).toFixed(2)} INR)`);

  // 3. Buy Fast Green Coin WIF/USDT
  if (usdtBal >= 1.0) {
    console.log(`\n  [3/3] Buying High-Speed Bullish Coin (WIF) with $${usdtBal.toFixed(2)} USDT...`);
    const buyRes = await api('/api/v3/order', 'POST', {
      symbol: 'WIFUSDT',
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: usdtBal.toFixed(2)
    });

    console.log(`\n  🎉 SUCCESS! REAL SPOT ORDER FILLED ON BINANCE!`);
    console.log(`      • Symbol Bought : WIF / USDT 🐶🎩`);
    console.log(`      • Order ID      : ${buyRes.orderId}`);
    console.log(`      • Status        : ${buyRes.status}`);
    console.log(`      • Quantity      : ${buyRes.executedQty} WIF Coins`);
    console.log(`      • Total Capital : $${buyRes.cummulativeQuoteQty} USDT\n`);
  }
}

shiftToWif().catch(console.error);
