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

function req(path) {
  return new Promise(res => {
    https.get(`https://api.binance.com${path}`, { headers: { 'User-Agent': 'BharatOS/1.0', 'X-MBX-APIKEY': KEY } }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { res(null); } });
    });
  });
}

async function run() {
  const tStart = new Date('2026-09-07T00:00:00Z').getTime();
  const tEnd = new Date('2026-09-09T23:59:59Z').getTime();

  const spotSnap = await req(`/sapi/v1/accountSnapshot?${sign({ type: 'SPOT', startTime: tStart, endTime: tEnd })}`);
  const futSnap = await req(`/sapi/v1/accountSnapshot?${sign({ type: 'FUTURES', startTime: tStart, endTime: tEnd })}`);

  console.log('=== SPOT SNAPSHOTS (8 Sep 2026) ===');
  if (spotSnap && spotSnap.snapshotVos) {
    spotSnap.snapshotVos.forEach(s => {
      console.log(new Date(s.updateTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), JSON.stringify(s.data));
    });
  }

  console.log('=== FUTURES SNAPSHOTS (8 Sep 2026) ===');
  if (futSnap && futSnap.snapshotVos) {
    futSnap.snapshotVos.forEach(s => {
      console.log(new Date(s.updateTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), JSON.stringify(s.data));
    });
  }
}

run();
