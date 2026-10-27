const crypto = require('crypto');
const https = require('https');
require('../env_loader');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function getServerTime() {
  return new Promise((resolve, reject) => {
    https.get('https://api.binance.com/api/v3/time', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d).serverTime));
    }).on('error', reject);
  });
}

async function test() {
  console.log("Testing with API Key from .env:", API_KEY.substring(0, 10) + "...");
  const serverTime = await getServerTime();
  const qs = `timestamp=${serverTime}&recvWindow=60000`;
  const sig = crypto.createHmac('sha256', SECRET_KEY).update(qs).digest('hex');

  const options = {
    hostname: 'api.binance.com',
    path: `/api/v3/account?${qs}&signature=${sig}`,
    method: 'GET',
    headers: { 'X-MBX-APIKEY': API_KEY }
  };

  const req = https.request(options, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      console.log("HTTP Status:", res.statusCode);
      const body = JSON.parse(d);
      if (body.balances) {
        console.log("✅ SUCCESS! Account handshake verified from .env!");
        const nonZero = body.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
        console.log("Non-zero balances:", nonZero);
      } else {
        console.log("❌ Response:", body);
      }
    });
  });
  req.on('error', console.error);
  req.end();
}

test();
