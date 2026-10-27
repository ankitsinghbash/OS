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

async function checkAccountTradeFees() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🔍 OFFICIAL BINANCE ACCOUNT-LEVEL EXACT TRADE FEE AUDIT");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  const symbols = ['BTCUSDT', 'BTCFDUSD', 'FDUSDUSDT', 'SOLUSDT', 'ETHFDUSD'];
  
  for (const sym of symbols) {
    try {
      const feeData = await api('/sapi/v1/asset/tradeFee', 'GET', { symbol: sym });
      console.log(`Symbol: ${sym}`);
      console.log(JSON.stringify(feeData, null, 2));
    } catch(e) {
      console.log(`Error checking ${sym}:`, e.message);
    }
  }
}

checkAccountTradeFees().catch(console.error);
