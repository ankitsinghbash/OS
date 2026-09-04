const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');


// Dynamically locate .env (Zero Hardcoded Personal Paths)
let envContent = '';
const candidatePaths = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '.env'),
  path.join(os.homedir(), 'bharatos', '.env'),
  process.env.BHARATOS_ENV_PATH
].filter(Boolean);


for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    try {
      envContent = fs.readFileSync(p, 'utf8');
      break;
    } catch (e) {}
  }
}

const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
});

const KEY = env.BINANCE_API_KEY;
const SECRET = env.BINANCE_SECRET_KEY;
const USD_TO_INR = 95.07;

function sign(params) {
  const qs = Object.entries({ ...params, timestamp: Date.now(), recvWindow: 10000 })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const signature = crypto.createHmac('sha256', SECRET).update(qs).digest('hex');
  return `${qs}&signature=${signature}`;
}

function get(host, endpoint, requireAuth) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'BharatOS/1.0' };
    if (requireAuth) headers['X-MBX-APIKEY'] = KEY;
    
    const req = https.get({ hostname: host, path: endpoint, headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          resolve(null);
        }
      });
    });
    
    req.on('error', (err) => {
      resolve({ error: err.message });
    });
    
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ error: 'Request timeout' });
    });
  });
}

async function getDashboardData() {
  const result = {
    success: true,
    timestamp: Date.now(),
    lastUpdatedIST: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    wallet: {
      totalUSD: 0,
      totalINR: 0,
      spotUSD: 0,
      futuresUSD: 0,
      spotAssets: [],
      futuresPositions: []
    },
    profitLogs: []
  };

  try {
    // 1. Fetch Spot Account
    const spotAcct = await get('api.binance.com', `/api/v3/account?${sign({})}`, true);
    const tickers = await get('api.binance.com', '/api/v3/ticker/price', false);
    const priceMap = {};
    if (Array.isArray(tickers)) {
      tickers.forEach(t => { priceMap[t.symbol] = parseFloat(t.price); });
    }

    let spotUSD = 0;
    if (spotAcct && Array.isArray(spotAcct.balances)) {
      const nonZero = spotAcct.balances.filter(b => parseFloat(b.free) > 0.00001 || parseFloat(b.locked) > 0.00001);
      for (const b of nonZero) {
        const free = parseFloat(b.free);
        const locked = parseFloat(b.locked);
        const total = free + locked;
        let usdVal = 0;
        if (b.asset === 'USDT' || b.asset === 'FDUSD') {
          usdVal = total;
        } else {
          const p = priceMap[b.asset + 'USDT'] || priceMap[b.asset + 'FDUSD'] || 0;
          usdVal = total * p;
        }
        spotUSD += usdVal;
        result.wallet.spotAssets.push({
          asset: b.asset,
          free: free.toFixed(4),
          locked: locked.toFixed(4),
          total: total.toFixed(4),
          usdValue: usdVal.toFixed(4),
          inrValue: (usdVal * USD_TO_INR).toFixed(2)
        });
      }
    }
    result.wallet.spotUSD = parseFloat(spotUSD.toFixed(4));

    // 2. Fetch Futures Account
    const futAcct = await get('fapi.binance.com', `/fapi/v2/account?${sign({})}`, true);
    let futUSD = 0;
    if (futAcct && Array.isArray(futAcct.assets)) {
      const u = futAcct.assets.find(a => a.asset === 'USDT');
      if (u) futUSD = parseFloat(u.walletBalance);
    }
    if (futAcct && Array.isArray(futAcct.positions)) {
      const activePos = futAcct.positions.filter(p => Math.abs(parseFloat(p.positionAmt)) > 0);
      result.wallet.futuresPositions = activePos.map(p => ({
        symbol: p.symbol,
        positionAmt: parseFloat(p.positionAmt),
        entryPrice: parseFloat(p.entryPrice).toFixed(4),
        unrealizedProfit: parseFloat(p.unrealizedProfit).toFixed(4),
        leverage: p.leverage || '1x'
      }));
    }
    result.wallet.futuresUSD = parseFloat(futUSD.toFixed(4));

    // Grand Totals
    const totalUSD = spotUSD + futUSD;
    result.wallet.totalUSD = parseFloat(totalUSD.toFixed(4));
    result.wallet.totalINR = parseFloat((totalUSD * USD_TO_INR).toFixed(2));

    // 3. Last 10 Funding Fee Income Logs
    const incomeRaw = await get('fapi.binance.com', `/fapi/v1/income?${sign({ incomeType: 'FUNDING_FEE', limit: 10 })}`, true);
    if (Array.isArray(incomeRaw)) {
      // Sort newest first
      const sorted = [...incomeRaw].sort((a, b) => b.time - a.time);
      result.profitLogs = sorted.slice(0, 10).map(it => {
        const inc = parseFloat(it.income);
        return {
          tranId: it.tranId,
          symbol: it.symbol,
          incomeType: it.incomeType,
          incomeUSDT: inc >= 0 ? `+${inc.toFixed(8)}` : inc.toFixed(8),
          rawIncome: inc,
          incomeINR: inc >= 0 ? `+₹${(inc * USD_TO_INR).toFixed(4)}` : `-₹${Math.abs(inc * USD_TO_INR).toFixed(4)}`,
          asset: it.asset,
          time: it.time,
          timeIST: new Date(it.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }),
          isPositive: inc >= 0
        };
      });
    } else {
      result.incomeError = incomeRaw;
    }
  } catch (err) {
    result.success = false;
    result.error = err.message;
  }

  return result;
}

if (require.main === module) {
  getDashboardData().then(data => {
    console.log(JSON.stringify(data, null, 2));
  });
}

module.exports = { getDashboardData };
