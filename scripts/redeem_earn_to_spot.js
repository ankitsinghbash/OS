const crypto = require('crypto');
const https = require('https');
require('../env_loader');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function api(path, method = 'POST', params = {}) {
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

async function redeemToSpot() {
  console.log("=== CHECKING SIMPLE EARN FLEXIBLE USDT POSITION ===");
  const pos = await api('/sapi/v1/simple-earn/flexible/position', 'GET', { asset: 'USDT' });
  console.log("Flexible Position:", pos);

  if (pos && pos.rows && pos.rows.length > 0) {
    const row = pos.rows[0];
    const productId = row.productId;
    const amt = row.totalAmount;
    console.log(`\nRedeeming ${amt} USDT (Product ID: ${productId}) to Spot Wallet...`);
    
    // Attempt redeem
    const res = await api('/sapi/v1/simple-earn/flexible/redeem', 'POST', {
      productId: productId,
      amount: amt,
      type: 'FAST'
    });
    console.log("Redeem Response:", res);
  } else {
    console.log("No flexible USDT positions found in Simple Earn.");
  }

  // Check Spot balance now
  const acc = await api('/api/v3/account', 'GET');
  const balances = (acc.balances || []).filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
  console.log("\n=== UPDATED SPOT BALANCES ===");
  console.log(balances);
}

redeemToSpot().catch(console.error);
