const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const env = {};
const envPath = fs.existsSync('/home/bharatos_user/bharatos/.env')
  ? '/home/bharatos_user/bharatos/.env'
  : 'd:/Office/Whatsipfy_Project/BharatOS/.env';

fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=');
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

function req(host, path, params) {
  return new Promise(res => {
    const qs = Object.entries({ ...params, timestamp: Date.now(), recvWindow: 10000 })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const sig = crypto.createHmac('sha256', env.BINANCE_SECRET_KEY).update(qs).digest('hex');
    const url = `https://${host}${path}?${qs}&signature=${sig}`;
    https.get(url, { headers: { 'X-MBX-APIKEY': env.BINANCE_API_KEY } }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { res(null); } });
    });
  });
}

async function run() {
  console.log('=== 🔍 RECENT TRADES AUDIT ===\n');

  const futTrades = await req('fapi.binance.com', '/fapi/v1/userTrades', { symbol: 'CRVUSDT', limit: 10 });
  const spotTrades = await req('api.binance.com', '/api/v3/myTrades', { symbol: 'CRVUSDT', limit: 10 });

  console.log('--- SPOT TRADES (CRVUSDT) ---');
  if (Array.isArray(spotTrades) && spotTrades.length > 0) {
    spotTrades.forEach(t => {
      const d = new Date(t.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      console.log(`[${d}] ID: ${t.id} | ${t.isBuyer ? 'BUY' : 'SELL'} ${t.qty} CRV @ $${t.price} = $${(t.qty * t.price).toFixed(4)} | Fee: ${t.commission} ${t.commissionAsset}`);
    });
  } else {
    console.log('No spot trades or empty response:', spotTrades);
  }

  console.log('\n--- FUTURES TRADES (CRVUSDT) ---');
  if (Array.isArray(futTrades) && futTrades.length > 0) {
    futTrades.forEach(t => {
      const d = new Date(t.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      console.log(`[${d}] ID: ${t.id} | ${t.side} ${t.qty} CRV @ $${t.price} = $${(t.qty * t.price).toFixed(4)} | Realized PnL: $${t.realizedPnl} | Fee: ${t.commission} ${t.commissionAsset}`);
    });
  } else {
    console.log('No futures trades or empty response:', futTrades);
  }

  // Also check if there were any other symbols traded in the last 48 hours
  const allFutTrades = await req('fapi.binance.com', '/fapi/v1/userTrades', { limit: 10 });
  console.log('\n--- ALL RECENT FUTURES TRADES (ANY PAIR) ---');
  if (Array.isArray(allFutTrades) && allFutTrades.length > 0) {
    allFutTrades.forEach(t => {
      const d = new Date(t.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      console.log(`[${d}] Symbol: ${t.symbol} | ${t.side} ${t.qty} @ $${t.price} | PnL: $${t.realizedPnl} | Fee: ${t.commission} ${t.commissionAsset}`);
    });
  }
}

run();
