const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const path = require('path');
const os = require('os');

const env = {};
const envPaths = [
  path.join(__dirname, '..', '.env'),
  path.join(os.homedir(), 'bharatos', '.env'),
  process.env.BHARATOS_ENV_PATH
].filter(Boolean);

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach(l => {
      const i = l.indexOf('=');
      if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    });
    break;
  }
}


const ts = Date.now();
const qs = 'timestamp=' + ts + '&recvWindow=10000';
const sig = crypto.createHmac('sha256', env.BINANCE_SECRET_KEY).update(qs).digest('hex');
const url = 'https://fapi.binance.com/fapi/v2/positionRisk?' + qs + '&signature=' + sig;

https.get(url, { headers: { 'X-MBX-APIKEY': env.BINANCE_API_KEY } }, r => {
  let d = ''; r.on('data', c => d += c);
  r.on('end', () => {
    const pos = JSON.parse(d).filter(p => parseFloat(p.positionAmt) !== 0);
    console.log('ACTIVE FUTURES POSITIONS:', JSON.stringify(pos, null, 2));
  });
}).end();
