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
        try { resolve(JSON.parse(d)); } catch (e) { resolve({ raw: d }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function convertSolToUsdtAndPrepBtc() {
  console.log("=== 1. CHECKING CURRENT SOL BALANCE ===");
  const acc = await api('/api/v3/account', 'GET');
  const solBal = (acc.balances || []).find(b => b.asset === 'SOL');
  const freeSol = solBal ? parseFloat(solBal.free) : 0;
  console.log(`Free SOL Balance: ${freeSol}`);

  if (freeSol >= 0.05) {
    // Step size for SOL is 0.001 or 0.01 (let's use 0.052 or 0.053)
    const sellQty = (Math.floor(freeSol * 100) / 100).toFixed(2); // 0.05
    // Or sell all freeSol formatted to 2 decimals
    console.log(`Executing Market SELL of ${sellQty} SOL to USDT...`);
    const orderRes = await api('/api/v3/order', 'POST', {
      symbol: 'SOLUSDT',
      side: 'SELL',
      type: 'MARKET',
      quantity: sellQty
    });
    console.log("SELL SOL Result:", orderRes);
  } else {
    console.log("SOL already below minimum or sold.");
  }

  // Check updated balances
  const accAfter = await api('/api/v3/account', 'GET');
  const balances = (accAfter.balances || []).filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
  console.log("\n=== UPDATED BALANCES AFTER SELL ===");
  console.log(balances);

  // Check BTC live price & minimum order
  const btcTicker = await new Promise(r => {
    https.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => r(JSON.parse(d)));
    });
  });
  console.log(`\nBitcoin (BTC) Live Price: $${parseFloat(btcTicker.price).toFixed(2)} USD`);
}

convertSolToUsdtAndPrepBtc().catch(console.error);
