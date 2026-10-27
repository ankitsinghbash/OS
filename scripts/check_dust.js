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

function req(endpoint, method = 'POST', body = '') {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'BharatOS/1.0',
      'X-MBX-APIKEY': KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    };
    const r = https.request({ hostname: 'api.binance.com', path: endpoint, method, headers }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve(d); }
      });
    });
    r.on('error', err => resolve({ error: err.message }));
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  console.log('Checking dust assets eligible for conversion...');
  const queryStr = sign({});
  // Check which assets can be converted to BNB
  const dustBtc = await req(`/sapi/v1/asset/dust-btc?${queryStr}`, 'POST', '');
  console.log('Dust BTC query response:', JSON.stringify(dustBtc, null, 2));
}

main().catch(console.error);
