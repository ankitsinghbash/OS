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
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ raw: d }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function prepareFDUSD() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🚀 PREPARING WALLET & LAUNCHING BTC/FDUSD ZERO-FEE 200-TRADE ENGINE");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  // 1. Check current balances
  const acc = await api('/api/v3/account', 'GET');
  const btcBal = (acc.balances || []).find(b => b.asset === 'BTC');
  const usdtBal = (acc.balances || []).find(b => b.asset === 'USDT');
  const fdusdBal = (acc.balances || []).find(b => b.asset === 'FDUSD');

  const freeBtc = btcBal ? parseFloat(btcBal.free) : 0;
  const freeUsdt = usdtBal ? parseFloat(usdtBal.free) : 0;
  const freeFdusd = fdusdBal ? parseFloat(fdusdBal.free) : 0;

  console.log(`📌 1. CURRENT WALLET BALANCES:`);
  console.log(`   • BTC   : ${freeBtc.toFixed(8)} BTC`);
  console.log(`   • USDT  : ${freeUsdt.toFixed(4)} USDT`);
  console.log(`   • FDUSD : ${freeFdusd.toFixed(4)} FDUSD`);

  // 2. Sell remaining BTC to USDT if any
  if (freeBtc >= 0.00005) {
    console.log(`\nSelling ${freeBtc.toFixed(6)} BTC to USDT...`);
    const sellRes = await api('/api/v3/order', 'POST', {
      symbol: 'BTCUSDT',
      side: 'SELL',
      type: 'MARKET',
      quantity: (Math.floor(freeBtc * 100000) / 100000).toFixed(5) // 0.00005 or 0.00006
    });
    console.log("BTC Sell Result:", sellRes);
  }

  // 3. Convert all USDT to FDUSD (via FDUSDUSDT pair or 1:1 Convert)
  const acc2 = await api('/api/v3/account', 'GET');
  const usdtNow = (acc2.balances || []).find(b => b.asset === 'USDT');
  const totalUsdt = usdtNow ? parseFloat(usdtNow.free) : 0;
  console.log(`\nLiquid USDT Cash Available to Convert: $${totalUsdt.toFixed(4)} USDT`);

  if (totalUsdt >= 5.0) {
    console.log(`Converting ${totalUsdt.toFixed(2)} USDT to FDUSD on FDUSDUSDT pair...`);
    const buyFdusd = await api('/api/v3/order', 'POST', {
      symbol: 'FDUSDUSDT',
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: (Math.floor(totalUsdt * 100) / 100).toFixed(2)
    });
    console.log("FDUSD Buy Result:", buyFdusd);
  }

  // 4. Final Balance Check
  const accFinal = await api('/api/v3/account', 'GET');
  const nonZero = (accFinal.balances || []).filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
  console.log("\n════════════════════════════════════════════════════════════════════════════════════");
  console.log("💼 FINAL READY BALANCES FOR ZERO-FEE BTC/FDUSD ENGINE:");
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  nonZero.forEach(b => console.log(`   • ${b.asset.padEnd(8)}: Free = ${b.free}`));
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");
}

prepareFDUSD().catch(console.error);
