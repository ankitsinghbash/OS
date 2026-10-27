const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const env = {};
fs.readFileSync('/home/ankitsingh4734414/bharatos/.env', 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=');
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const KEY = env.BINANCE_API_KEY;
const SECRET = env.BINANCE_SECRET_KEY;

function sign(params) {
  const qs = Object.entries({ ...params, timestamp: Date.now(), recvWindow: 10000 })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const signature = crypto.createHmac('sha256', SECRET).update(qs).digest('hex');
  return `${qs}&signature=${signature}`;
}

function req(endpoint, body) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'BharatOS/1.0',
      'X-MBX-APIKEY': KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    };
    const r = https.request({ hostname: 'api.binance.com', path: endpoint, method: 'POST', headers }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve(d); }
      });
    });
    r.on('error', err => resolve({ error: err.message }));
    r.write(body);
    r.end();
  });
}

async function main() {
  console.log('Testing internal transfer permissions...');
  // 1. Redeem Simple Earn
  const redeemRes = await req('/sapi/v1/simple-earn/flexible/redeem', sign({ productId: 'USDT001', redeemAll: true }));
  console.log('Redeem Earn:', JSON.stringify(redeemRes));

  // 2. Transfer Futures to Funding (UMFUTURE_FUNDING)
  const futTransfer = await req('/sapi/v1/asset/transfer', sign({
    type: 'UMFUTURE_FUNDING',
    asset: 'USDT',
    amount: '1.80'
  }));
  console.log('Futures to Funding:', JSON.stringify(futTransfer));

  // 3. Transfer Spot to Funding (MAIN_FUNDING)
  const spotTransfer = await req('/sapi/v1/asset/transfer', sign({
    type: 'MAIN_FUNDING',
    asset: 'USDT',
    amount: '5.47'
  }));
  console.log('Spot to Funding:', JSON.stringify(spotTransfer));
}

main().catch(console.error);
