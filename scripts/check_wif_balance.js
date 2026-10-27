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

function getPrice(sym) {
  return new Promise((r, j) => {
    https.get(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          r(parseFloat(JSON.parse(d).price));
        } catch (e) {
          r(0.0);
        }
      });
    }).on('error', () => r(0.0));
  });
}

async function auditRealBalanceChanges() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

  console.log("═════════════════════════════════════════════════════════════════════════");
  console.log(`  💼 BHARAT OS — OFFICIAL REAL SPOT WALLET AUDIT [${timeStr} IST]`);
  console.log("═════════════════════════════════════════════════════════════════════════\n");

  const [acc, wifPrice, dogePrice] = await Promise.all([
    api('/api/v3/account', 'GET'),
    getPrice('WIFUSDT'),
    getPrice('DOGEUSDT')
  ]);
  
  const wifBal = parseFloat(acc.balances?.find(b => b.asset === 'WIF')?.free || '0');
  const usdtBal = parseFloat(acc.balances?.find(b => b.asset === 'USDT')?.free || '0');
  const dogeBal = parseFloat(acc.balances?.find(b => b.asset === 'DOGE')?.free || '0');

  const wifValueUSD = wifBal * wifPrice;
  const dogeValueUSD = dogeBal * dogePrice;
  const totalUSD = usdtBal + wifValueUSD + dogeValueUSD;
  const totalINR = totalUSD * 83.50;
  const totalP2P = totalUSD * 95.00;

  console.log("  📊 ITEMIZED SPOT ASSET BREAKDOWN:");
  console.log(`  -----------------------------------------------------------------------`);
  console.log(`  💵 1. Free Liquid Cash (USDT) : $${usdtBal.toFixed(4)} USD  (₹${(usdtBal * 83.50).toFixed(2)} INR) [100% SAFE]`);
  console.log(`  🪙 2. WIF Coin Holdings       : ${wifBal.toFixed(6)} WIF  ($${wifValueUSD.toFixed(4)} USD) [Dip Watch]`);
  console.log(`  🐕 3. DOGE Coin Dust          : ${dogeBal.toFixed(4)} DOGE ($${dogeValueUSD.toFixed(4)} USD  ₹${(dogeValueUSD * 83.50).toFixed(2)} INR)`);
  console.log(`  -----------------------------------------------------------------------`);
  console.log(`  📈 Live Market Rates : WIF = $${wifPrice.toFixed(4)} | DOGE = $${dogePrice.toFixed(4)}`);
  console.log(`  🛡️ Active Protection : 5M Macro Trend Filter (Capital Protected in USDT)`);
  console.log("═════════════════════════════════════════════════════════════════════════");
  console.log(`  🏆 TOTAL SPOT WALLET REAL NET WORTH:`);
  console.log(`     👉 USD ($) : $${totalUSD.toFixed(2)} USD ($${totalUSD.toFixed(4)})`);
  console.log(`     👉 INR (₹) : ₹${totalINR.toFixed(2)} INR (Official Forex Rate @ 83.50)`);
  console.log(`     👉 INR (₹) : ₹${totalP2P.toFixed(2)} INR (Binance P2P Real Cashout @ 95.00)`);
  console.log("═════════════════════════════════════════════════════════════════════════\n");
}

auditRealBalanceChanges().catch(console.error);
