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

  // Spot Snapshots
  const spotSnap = await req('api.binance.com', `/sapi/v1/accountSnapshot?${sign({ type: 'SPOT', startTime: thirtyDaysAgo, limit: 30 })}`);
  // Futures Snapshots
  const futSnap = await req('api.binance.com', `/sapi/v1/accountSnapshot?${sign({ type: 'FUTURES', startTime: thirtyDaysAgo, limit: 30 })}`);
  
  // BTC Price history or current BTC price
  const btcPriceObj = await req('api.binance.com', '/api/v3/ticker/price?symbol=BTCUSDT');
  const btcPrice = parseFloat(btcPriceObj.price || 0);

  console.log('\n--- DAILY TIMELINE (SPOT + FUTURES) ---');
  if (spotSnap && spotSnap.snapshotVos) {
    spotSnap.snapshotVos.forEach(s => {
      const dateStr = new Date(s.updateTime).toLocaleDateString('en-IN');
      const btcVal = parseFloat(s.data?.totalAssetOfBtc || 0);
      const spotUSD = btcVal * btcPrice;
      const balances = (s.data?.balances || []).filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
      
      // Match with futures snapshot for same day
      let futBal = 0;
      let futMargin = 0;
      if (futSnap && futSnap.snapshotVos) {
        const matchingFut = futSnap.snapshotVos.find(f => Math.abs(f.updateTime - s.updateTime) < 12 * 3600 * 1000);
        if (matchingFut && matchingFut.data?.assets) {
          const u = matchingFut.data.assets.find(a => a.asset === 'USDT');
          if (u) {
            futBal = parseFloat(u.walletBalance);
            futMargin = parseFloat(u.marginBalance);
          }
        }
      }

      console.log(`${dateStr.padEnd(12)} | Spot BTC: ${btcVal.toFixed(8)} (~$${spotUSD.toFixed(2)}) | Fut Cash: $${futBal.toFixed(4)} | Fut Margin: $${futMargin.toFixed(4)} | Total: ~$${(spotUSD + futMargin).toFixed(2)}`);
    });
  }
}

main().catch(console.error);
