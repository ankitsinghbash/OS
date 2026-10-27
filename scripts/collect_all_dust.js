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

function req(endpoint, body = '') {
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
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  console.log('1. Converting CRV dust to BNB...');
  const dustRes = await req('/sapi/v1/asset/dust', sign({ asset: 'CRV' }));
  console.log('Dust convert CRV to BNB:', JSON.stringify(dustRes));

  // Check spot BNB balance
  const spotAcct = await new Promise(res => {
    https.get(`https://api.binance.com/api/v3/account?${sign({})}`, { headers: { 'X-MBX-APIKEY': KEY } }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    });
  });

  const bnbBal = spotAcct.balances.find(b => b.asset === 'BNB');
  console.log('Current BNB balance:', JSON.stringify(bnbBal));

  if (bnbBal && parseFloat(bnbBal.free) > 0.00001) {
    const bnbFree = parseFloat(bnbBal.free).toFixed(6);
    console.log(`2. Transferring ${bnbFree} BNB to Funding Wallet...`);
    const xferRes = await req('/sapi/v1/asset/transfer', sign({
      type: 'MAIN_FUNDING',
      asset: 'BNB',
      amount: bnbFree
    }));
    console.log('BNB Transfer result:', JSON.stringify(xferRes));
  }
}

main().catch(console.error);
