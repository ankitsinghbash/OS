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
const USD_TO_INR = 95.07;

function sign(params) {
  const qs = Object.entries({ ...params, timestamp: Date.now(), recvWindow: 10000 })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const signature = crypto.createHmac('sha256', SECRET).update(qs).digest('hex');
  return `${qs}&signature=${signature}`;
}

function req(host, endpoint, method = 'GET', postData = null) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'BharatOS/1.0', 'X-MBX-APIKEY': KEY };
    if (postData) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const r = https.request({ hostname: host, path: endpoint, method, headers }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve(d); }
      });
    });
    r.on('error', err => resolve({ error: err.message }));
    if (postData) r.write(postData);
    r.end();
  });
}

async function main() {
  console.log('Fetching live data from Binance...');

  // 1. All Wallets Balance Overview (SAPI)
  const walletOverview = await req('api.binance.com', `/sapi/v1/asset/wallet/balance?${sign({})}`);

  // 2. Spot Balances & Prices
  const spotAcct = await req('api.binance.com', `/api/v3/account?${sign({})}`);
  const tickers = await req('api.binance.com', '/api/v3/ticker/price');
  const priceMap = {};
  if (Array.isArray(tickers)) {
    tickers.forEach(t => { priceMap[t.symbol] = parseFloat(t.price); });
  }

  // 3. Futures Account (USDT-M)
  const futAcct = await req('fapi.binance.com', `/fapi/v2/account?${sign({})}`);

  // 4. Funding Wallet
  const fundBody = sign({});
  const fundAcct = await req('api.binance.com', '/sapi/v1/asset/get-funding-asset', 'POST', fundBody);

  // 5. Simple Earn (Flexible)
  const earnBody = sign({});
  const earnAcct = await req('api.binance.com', `/sapi/v1/simple-earn/flexible/position?${sign({})}`);

  console.log('\n======================================================');
  console.log('              📊 DETAILED BALANCE AUDIT               ');
  console.log('======================================================\n');

  console.log('--- 1. WALLET OVERVIEW (sapi/v1/asset/wallet/balance) ---');
  console.log(JSON.stringify(walletOverview, null, 2));

  console.log('\n--- 2. SPOT WALLET ASSETS ---');
  let spotTotalUSD = 0;
  if (spotAcct && spotAcct.balances) {
    spotAcct.balances.forEach(b => {
      const free = parseFloat(b.free);
      const locked = parseFloat(b.locked);
      const total = free + locked;
      if (total > 0.000001) {
        let price = 0;
        if (b.asset === 'USDT' || b.asset === 'FDUSD') price = 1;
        else if (priceMap[b.asset + 'USDT']) price = priceMap[b.asset + 'USDT'];
        else if (priceMap[b.asset + 'FDUSD']) price = priceMap[b.asset + 'FDUSD'];

        const valUSD = total * price;
        spotTotalUSD += valUSD;
        console.log(`  ${b.asset.padEnd(8)}: ${total} (Free: ${free}, Locked: ${locked}) ≈ $${valUSD.toFixed(4)} USD`);
      }
    });
  }
  console.log(`Spot Total USD: $${spotTotalUSD.toFixed(4)} (~₹${(spotTotalUSD * USD_TO_INR).toFixed(2)})`);

  console.log('\n--- 3. FUTURES WALLET ---');
  let futWalletBalance = 0;
  let futMarginBalance = 0;
  let futUnrealizedPnL = 0;
  if (futAcct && futAcct.totalWalletBalance !== undefined) {
    futWalletBalance = parseFloat(futAcct.totalWalletBalance);
    futMarginBalance = parseFloat(futAcct.totalMarginBalance);
    futUnrealizedPnL = parseFloat(futAcct.totalUnrealizedProfit);
    console.log(`  Futures Wallet Balance (Cash):   $${futWalletBalance.toFixed(4)} USDT`);
    console.log(`  Unrealized PnL (Floating):       $${futUnrealizedPnL.toFixed(4)} USDT`);
    console.log(`  Futures Margin Balance (Equity): $${futMarginBalance.toFixed(4)} USDT`);
  }

  console.log('\n--- 4. FUNDING WALLET ---');
  console.log(JSON.stringify(fundAcct, null, 2));

  console.log('\n--- 5. SIMPLE EARN ---');
  if (earnAcct && earnAcct.rows) {
    console.log(JSON.stringify(earnAcct.rows, null, 2));
  } else {
    console.log(JSON.stringify(earnAcct, null, 2));
  }

  console.log('\n======================================================');
  console.log('                 💰 TOTAL SUMMARY                     ');
  console.log('======================================================');
  console.log(`1. Cash/Nominal Balance (Spot + Futures Wallet Bal):`);
  const nominalUSD = spotTotalUSD + futWalletBalance;
  console.log(`   $${nominalUSD.toFixed(4)} USD ≈ ₹${(nominalUSD * USD_TO_INR).toFixed(2)} INR`);

  console.log(`\n2. Net Liquidation / Actual Net Equity (Spot + Futures Margin Balance):`);
  console.log(`   (Futures position close karne ke baad actual hath me aane wala paisa)`);
  const netUSD = spotTotalUSD + futMarginBalance;
  console.log(`   $${netUSD.toFixed(4)} USD ≈ ₹${(netUSD * USD_TO_INR).toFixed(2)} INR`);
  console.log('======================================================\n');
}

main().catch(console.error);
