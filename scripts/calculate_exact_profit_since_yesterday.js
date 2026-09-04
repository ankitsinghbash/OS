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


const API_KEY = env.BINANCE_API_KEY;
const SECRET = env.BINANCE_SECRET_KEY;
const INR_RATE = 95.07;

function apiGet(host, path, params = {}) {
  return new Promise((resolve) => {
    const ts = Date.now();
    const qs = Object.entries({ ...params, timestamp: ts, recvWindow: 10000 })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const sig = crypto.createHmac('sha256', SECRET).update(qs).digest('hex');
    const url = `https://${host}${path}?${qs}&signature=${sig}`;
    https.get(url, { headers: { 'X-MBX-APIKEY': API_KEY } }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function pubGet(host, path) {
  return new Promise((resolve) => {
    https.get(`https://${host}${path}`, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🇮🇳 BHARAT OS — COMPLETE 24-HOUR FORENSIC PROFIT AUDIT');
  console.log(`Audited Period: 2026-09-02 15:05:44 IST  ➔  ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // 1. Fetch Prices
  const spotPrices = await pubGet('api.binance.com', '/api/v3/ticker/price');
  const priceMap = {};
  if (Array.isArray(spotPrices)) {
    spotPrices.forEach(p => priceMap[p.symbol] = parseFloat(p.price));
  }

  // 2. Spot Account Balances
  const spotAcc = await apiGet('api.binance.com', '/api/v3/account');
  const spotBalances = {};
  let spotTotalUSD = 0;
  if (spotAcc && spotAcc.balances) {
    for (const b of spotAcc.balances) {
      const free = parseFloat(b.free);
      const locked = parseFloat(b.locked);
      const total = free + locked;
      if (total > 0.000001) {
        let val = 0;
        if (b.asset === 'USDT' || b.asset === 'FDUSD' || b.asset === 'LDUSDT') {
          val = total;
        } else {
          const p = priceMap[b.asset + 'USDT'] || 0;
          val = total * p;
        }
        spotBalances[b.asset] = { free, locked, total, val, price: val / total };
        spotTotalUSD += val;
      }
    }
  }

  // 3. Futures Account & Positions
  const futAcc = await apiGet('fapi.binance.com', '/fapi/v2/account');
  const futPositions = await apiGet('fapi.binance.com', '/fapi/v2/positionRisk');
  
  let futWalletUSDT = 0;
  let futUnrealizedPnL = 0;
  if (futAcc && futAcc.assets) {
    const usdt = futAcc.assets.find(a => a.asset === 'USDT');
    if (usdt) {
      futWalletUSDT = parseFloat(usdt.walletBalance);
      futUnrealizedPnL = parseFloat(usdt.unrealizedProfit);
    }
  }

  // 4. Funding Fee Income History (Since Yesterday)
  const startTime = 1788341744000; // yesterday 15:05:44 IST
  const incomeList = await apiGet('fapi.binance.com', '/fapi/v1/income', {
    startTime,
    limit: 50
  });

  let totalFundingEarned = 0;
  let totalCommissionsPaid = 0;
  let fundingItems = [];
  let commissionItems = [];

  if (Array.isArray(incomeList)) {
    for (const it of incomeList) {
      const inc = parseFloat(it.income);
      if (it.incomeType === 'FUNDING_FEE') {
        totalFundingEarned += inc;
        fundingItems.push({
          time: new Date(it.time).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}),
          symbol: it.symbol,
          amount: inc
        });
      } else if (it.incomeType === 'COMMISSION') {
        totalCommissionsPaid += Math.abs(inc);
        commissionItems.push({
          time: new Date(it.time).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}),
          symbol: it.symbol,
          amount: inc
        });
      }
    }
  }

  // 5. Total Net Liquidation Value Right Now
  const currentTotalUSD = spotTotalUSD + futWalletUSDT + futUnrealizedPnL;
  const currentTotalINR = currentTotalUSD * INR_RATE;

  // Baseline from yesterday:
  const baselineUSD = 7.78410562;
  const baselineINR = 740.03;

  const netDiffUSD = currentTotalUSD - baselineUSD;
  const netDiffINR = currentTotalINR - baselineINR;

  console.log('📌 1. YESTERDAY BASELINE (2026-09-02 15:05:44 IST):');
  console.log(`   Baseline Total Wealth: $${baselineUSD.toFixed(4)} USD (₹${baselineINR.toFixed(2)} INR)`);
  console.log(`   - USDT: $6.4961`);
  console.log(`   - BNB:  0.00188414 ≈ $1.2880\n`);

  console.log('📌 2. CURRENT LIVE ASSETS (TODAY):');
  console.log('   [SPOT WALLET]:');
  for (const [k, v] of Object.entries(spotBalances)) {
    console.log(`     • ${k}: ${v.total.toFixed(4)} @ $${v.price.toFixed(4)} = $${v.val.toFixed(4)} (₹${(v.val * INR_RATE).toFixed(2)})`);
  }
  console.log(`     Total Spot: $${spotTotalUSD.toFixed(4)} USD`);

  console.log('\n   [FUTURES WALLET]:');
  console.log(`     • Cash Balance: $${futWalletUSDT.toFixed(4)} USDT`);
  console.log(`     • Unrealized PnL: $${futUnrealizedPnL.toFixed(4)} USDT`);
  if (Array.isArray(futPositions)) {
    futPositions.filter(p => parseFloat(p.positionAmt) !== 0).forEach(p => {
      console.log(`     • Position: ${p.symbol} ${p.positionAmt} (Entry: $${p.entryPrice}, Mark: $${p.markPrice})`);
    });
  }
  console.log(`     Total Futures (Net): $${(futWalletUSDT + futUnrealizedPnL).toFixed(4)} USD`);

  console.log('\n   🏆 TOTAL CURRENT NET WEALTH:');
  console.log(`     $${currentTotalUSD.toFixed(4)} USD (₹${currentTotalINR.toFixed(2)} INR)`);

  console.log('\n📌 3. FUNDING FEE PAYOUTS RECEIVED:');
  fundingItems.forEach(f => {
    console.log(`     + $${f.amount.toFixed(6)} USDT | ${f.time} | ${f.symbol}`);
  });
  console.log(`   Total Funding Cash Received: +$${totalFundingEarned.toFixed(6)} USD (+₹${(totalFundingEarned * INR_RATE).toFixed(4)} INR)`);

  console.log('\n📌 4. NET PROFIT & LOSS RECONCILIATION:');
  console.log(`   Net Portfolio Change: ${netDiffUSD >= 0 ? '+' : ''}$${netDiffUSD.toFixed(4)} USD (${netDiffINR >= 0 ? '+' : ''}₹${netDiffINR.toFixed(2)} INR)`);
  console.log(`   Percentage Return: ${((netDiffUSD / baselineUSD) * 100).toFixed(2)}%`);

  console.log('\n═══════════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
