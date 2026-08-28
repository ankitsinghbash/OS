const crypto = require('crypto');
const https = require('https');

const fs = require('fs');
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const API_KEY = config.api_key;
const SECRET_KEY = config.secret_key;

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function getServerTime() {
  return new Promise((resolve, reject) => {
    https.get('https://api.binance.com/api/v3/time', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d).serverTime));
    }).on('error', reject);
  });
}

function getPrice(sym) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(parseFloat(JSON.parse(d).price)));
    }).on('error', reject);
  });
}

async function auditAllBalances() {
  const serverTime = await getServerTime();
  const params = {
    timestamp: serverTime - 500, // Sync perfectly with Binance server clock
    recvWindow: 60000
  };

  const qs = Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const signature = sign(qs);

  const options = {
    hostname: 'api.binance.com',
    port: 443,
    path: `/api/v3/account?${qs}&signature=${signature}`,
    method: 'GET',
    headers: { 'X-MBX-APIKEY': API_KEY }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', async () => {
        const body = JSON.parse(d);
        if (body.balances) {
          const nonZero = body.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
          console.log("═════════════════════════════════════════════════════════════════════════");
          console.log("  💼 BHARAT OS — BINANCE OFFICIAL REAL WALLET AUDIT (TIME-SYNCED)");
          console.log("═════════════════════════════════════════════════════════════════════════\n");
          
          let totalUSD = 0;
          for (const b of nonZero) {
            let valUSD = 0;
            const free = parseFloat(b.free);
            const locked = parseFloat(b.locked);
            const total = free + locked;

            if (b.asset === 'USDT') {
              valUSD = total;
            } else {
              try {
                const p = await getPrice(`${b.asset}USDT`);
                valUSD = total * p;
              } catch (e) {
                valUSD = 0;
              }
            }
            totalUSD += valUSD;
            console.log(`  🪙 Asset: ${b.asset.padEnd(8)} | Free: ${free.toFixed(8)} | Locked: ${locked.toFixed(8)} | USD Value: $${valUSD.toFixed(4)} (₹${(valUSD * 83.5).toFixed(2)} INR)`);
          }

          console.log("\n─────────────────────────────────────────────────────────────────────────");
          console.log(`  🏆 TOTAL ACCURATE PORTFOLIO NET WORTH: $${totalUSD.toFixed(4)} USD (≈ ₹${(totalUSD * 83.5).toFixed(2)} INR)`);
          console.log("═════════════════════════════════════════════════════════════════════════\n");
          resolve();
        } else {
          console.error("Binance API Error Response:", body);
          resolve();
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

auditAllBalances().catch(console.error);
