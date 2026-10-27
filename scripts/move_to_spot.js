const crypto = require('crypto');
const https = require('https');
require('../env_loader');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function transferFundingToSpot() {
  const ts = Date.now();
  const params = {
    type: 'FUNDING_MAIN', // FUNDING to SPOT (MAIN)
    asset: 'USDT',
    amount: '1.8',
    timestamp: ts,
    recvWindow: 60000
  };

  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const signature = sign(qs);

  const req = https.request({
    hostname: 'api.binance.com',
    path: `/sapi/v1/asset/transfer?${qs}&signature=${signature}`,
    method: 'POST',
    headers: { 'X-MBX-APIKEY': API_KEY }
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => console.log("Transfer Result:", d));
  });
  req.end();
}

transferFundingToSpot();
