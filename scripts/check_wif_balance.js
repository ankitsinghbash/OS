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

function getPrice(sym) {
  return new Promise((r, j) => {
    https.get(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => r(parseFloat(JSON.parse(d).price)));
    }).on('error', j);
  });
}

async function auditRealBalanceChanges() {
  console.log("═════════════════════════════════════════════════════════════════════════");
  console.log("  💼 BHARAT OS — BINANCE OFFICIAL REAL WALLET LIVE VALUE AUDIT");
  console.log("═════════════════════════════════════════════════════════════════════════\n");

  const acc = await api('/api/v3/account', 'GET');
  const wifPrice = await getPrice('WIFUSDT');
  
  const wifBal = parseFloat(acc.balances?.find(b => b.asset === 'WIF')?.free || '0');
  const usdtBal = parseFloat(acc.balances?.find(b => b.asset === 'USDT')?.free || '0');
  const dogeBal = parseFloat(acc.balances?.find(b => b.asset === 'DOGE')?.free || '0');

  const wifValueUSD = wifBal * wifPrice;
  const totalUSD = wifValueUSD + usdtBal;
  const totalINR = totalUSD * 83.50;

  console.log(`  🪙 1. WIF Asset Quantity  : ${wifBal.toFixed(8)} WIF`);
  console.log(`  📈 2. Live WIF Market Price: $${wifPrice.toFixed(4)} USD`);
  console.log(`  💵 3. WIF Spot Value (USD) : $${wifValueUSD.toFixed(4)} USD (₹${(wifValueUSD * 83.50).toFixed(2)} INR)`);
  console.log(`  💵 4. Free USDT Cash       : $${usdtBal.toFixed(4)} USD (₹${(usdtBal * 83.50).toFixed(2)} INR)`);
  if (dogeBal > 0.001) {
    console.log(`  🪙 5. Remaining DOGE Dust  : ${dogeBal.toFixed(8)} DOGE`);
  }
  console.log("─────────────────────────────────────────────────────────────────────────");
  console.log(`  🏆 TOTAL PORTFOLIO NET WORTH : $${totalUSD.toFixed(4)} USD (≈ ₹${totalINR.toFixed(2)} INR)`);
  console.log("═════════════════════════════════════════════════════════════════════════\n");
}

auditRealBalanceChanges().catch(console.error);
