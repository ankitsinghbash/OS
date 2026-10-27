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
  const now = Date.now();
  const thirtyDaysAgo = now - (35 * 24 * 60 * 60 * 1000);

  console.log(`\n======================================================`);
  console.log(` 📅 1-MONTH AUDIT (Since ${new Date(thirtyDaysAgo).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`);
  console.log(`======================================================\n`);

  // 1. Check Daily Account Snapshots for Spot
  const spotSnap = await req('api.binance.com', `/sapi/v1/accountSnapshot?${sign({ type: 'SPOT', startTime: thirtyDaysAgo, limit: 30 })}`);
  console.log('--- SPOT DAILY SNAPSHOTS (Sample first and last) ---');
  if (spotSnap && spotSnap.snapshotVos && spotSnap.snapshotVos.length > 0) {
    const snaps = spotSnap.snapshotVos;
    const first = snaps[0];
    const last = snaps[snaps.length - 1];
    console.log(`First Snapshot (${new Date(first.updateTime).toLocaleDateString('en-IN')}): Total Val BTC = ${first.data?.totalAssetOfBtc}`);
    console.log(`Last Snapshot (${new Date(last.updateTime).toLocaleDateString('en-IN')}): Total Val BTC = ${last.data?.totalAssetOfBtc}`);
    console.log(`Total snapshots available: ${snaps.length}`);
  } else {
    console.log('No Spot snapshot data or not accessible:', JSON.stringify(spotSnap));
  }

  // 2. Check Daily Account Snapshots for Futures
  const futSnap = await req('api.binance.com', `/sapi/v1/accountSnapshot?${sign({ type: 'FUTURES', startTime: thirtyDaysAgo, limit: 30 })}`);
  if (futSnap && futSnap.snapshotVos && futSnap.snapshotVos.length > 0) {
    const snaps = futSnap.snapshotVos;
    console.log(`Futures Snapshots count: ${snaps.length}`);
    const first = snaps[0];
    const last = snaps[snaps.length - 1];
    console.log(`First Futures Snapshot (${new Date(first.updateTime).toLocaleDateString('en-IN')}):`, JSON.stringify(first.data?.assets));
    console.log(`Last Futures Snapshot (${new Date(last.updateTime).toLocaleDateString('en-IN')}):`, JSON.stringify(last.data?.assets));
  } else {
    console.log('Futures Snapshots:', JSON.stringify(futSnap));
  }

  // 3. All Futures Income Breakdown (last 35 days)
  let allIncome = [];
  let pageStartTime = thirtyDaysAgo;
  while (true) {
    const batch = await req('fapi.binance.com', `/fapi/v1/income?${sign({ startTime: pageStartTime, limit: 1000 })}`);
    if (Array.isArray(batch) && batch.length > 0) {
      allIncome = allIncome.concat(batch);
      if (batch.length < 1000) break;
      pageStartTime = batch[batch.length - 1].time + 1;
    } else {
      break;
    }
  }

  console.log(`\n--- FUTURES INCOME BREAKDOWN (Total records: ${allIncome.length}) ---`);
  const incomeByType = {};
  let totalFundingFee = 0;
  let totalCommission = 0;
  let totalRealizedPnl = 0;
  let totalTransfer = 0;

  allIncome.forEach(it => {
    const type = it.incomeType;
    const amount = parseFloat(it.income);
    incomeByType[type] = (incomeByType[type] || 0) + amount;

    if (type === 'FUNDING_FEE') totalFundingFee += amount;
    else if (type === 'COMMISSION') totalCommission += amount;
    else if (type === 'REALIZED_PNL') totalRealizedPnl += amount;
    else if (type === 'TRANSFER') totalTransfer += amount;
  });

  console.log('Income by Type:');
  for (const [k, v] of Object.entries(incomeByType)) {
    console.log(`  ${k.padEnd(20)}: ${v.toFixed(6)} USDT (~₹${(v * USD_TO_INR).toFixed(2)})`);
  }

  // 4. Deposits / Withdrawals in last 35 days
  const deposits = await req('api.binance.com', `/sapi/v1/capital/deposit/hisrec?${sign({ startTime: thirtyDaysAgo })}`);
  const withdrawals = await req('api.binance.com', `/sapi/v1/capital/withdraw/history?${sign({ startTime: thirtyDaysAgo })}`);

  console.log('\n--- DEPOSITS & WITHDRAWALS ---');
  console.log('Deposits:', Array.isArray(deposits) ? deposits.length : JSON.stringify(deposits));
  if (Array.isArray(deposits) && deposits.length > 0) {
    deposits.forEach(d => console.log(`  Deposit: ${d.amount} ${d.coin} on ${new Date(d.insertTime).toLocaleString('en-IN')}`));
  }
  console.log('Withdrawals:', Array.isArray(withdrawals) ? withdrawals.length : JSON.stringify(withdrawals));
  if (Array.isArray(withdrawals) && withdrawals.length > 0) {
    withdrawals.forEach(w => console.log(`  Withdrawal: ${w.amount} ${w.coin} on ${new Date(w.applyTime).toLocaleString('en-IN')}`));
  }

  console.log('\n======================================================');
}

main().catch(console.error);
