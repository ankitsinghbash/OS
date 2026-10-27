const crypto = require('crypto');
const https = require('https');
require('../env_loader');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function checkFunding() {
  const ts = Date.now();
  const qs = `timestamp=${ts}&recvWindow=60000`;
  const signature = sign(qs);

  const req = https.request({
    hostname: 'api.binance.com',
    path: `/sapi/v1/asset/get-funding-asset?${qs}&signature=${signature}`,
    method: 'POST',
    headers: { 'X-MBX-APIKEY': API_KEY, 'Content-Type': 'application/json' }
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => console.log("Funding Balances:", d));
  });
  req.end();
}

checkFunding();
