const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const env = {};
const envPaths = [
  path.join(__dirname, '..', '.env'),
  '/home/ankitsingh4734414/bharatos/.env',
  path.join(os.homedir(), 'bharatos', '.env')
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach(l => {
      const i = l.indexOf('=');
      if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    });
    break;
  }
}

const KEY = env.BINANCE_API_KEY;
const SECRET = env.BINANCE_SECRET_KEY;

function sign(params) {
  const qs = Object.entries({ ...params, timestamp: Date.now(), recvWindow: 10000 })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const signature = crypto.createHmac('sha256', SECRET).update(qs).digest('hex');
  return `${qs}&signature=${signature}`;
}

function req(host, endpoint) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'BharatOS/1.0', 'X-MBX-APIKEY': KEY };
    const r = https.request({ hostname: host, path: endpoint, method: 'GET', headers }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve(d); }
      });
    });
    r.on('error', err => resolve({ error: err.message }));
    r.end();
  });
}

async function main() {
  // Check spot account
  const spotAcct = await req('api.binance.com', `/api/v3/account?${sign({})}`);
  // Check futures account
  const futAcct = await req('fapi.binance.com', `/fapi/v2/account?${sign({})}`);
  // Check tickers
  const tickers = await req('api.binance.com', '/api/v3/ticker/price');
  const priceMap = {};
  if (Array.isArray(tickers)) tickers.forEach(t => priceMap[t.symbol] = parseFloat(t.price));

  let spotUSD = 0;
  if (spotAcct && spotAcct.balances) {
    spotAcct.balances.forEach(b => {
      const total = parseFloat(b.free) + parseFloat(b.locked);
      if (total > 0.00001) {
        let p = 0;
        if (b.asset === 'USDT' || b.asset === 'FDUSD') p = 1;
        else if (priceMap[b.asset + 'USDT']) p = priceMap[b.asset + 'USDT'];
        spotUSD += total * p;
      }
    });
  }

  const futCash = parseFloat(futAcct.totalWalletBalance || 0);
  const futMargin = parseFloat(futAcct.totalMarginBalance || 0); // with unrealized PnL

  console.log(`Spot USD: $${spotUSD.toFixed(4)}`);
  console.log(`Futures Cash: $${futCash.toFixed(4)}`);
  console.log(`Futures Margin (Equity): $${futMargin.toFixed(4)}`);

  const nominalUSD = spotUSD + futCash;
  const netUSD = spotUSD + futMargin;

  console.log(`\nTotal Nominal USD: $${nominalUSD.toFixed(4)}`);
  console.log(`Total Net Equity USD: $${netUSD.toFixed(4)}`);

  console.log('\n--- CALCULATING INR AT DIFFERENT RATES ---');
  [88, 89, 90, 91, 92, 92.4, 93, 94, 95.07].forEach(rate => {
    console.log(`Rate ₹${rate}: Nominal = ₹${(nominalUSD * rate).toFixed(2)} | Net Equity = ₹${(netUSD * rate).toFixed(2)}`);
  });

  // Check what rate gives 744:
  console.log(`\nRate to get exactly 744:`);
  console.log(`If 744 is Nominal ($${nominalUSD.toFixed(4)}): Rate = ₹${(744 / nominalUSD).toFixed(2)} / USD`);
  console.log(`If 744 is Net Equity ($${netUSD.toFixed(4)}): Rate = ₹${(744 / netUSD).toFixed(2)} / USD`);
}

main().catch(console.error);
