const crypto = require('crypto');
const https = require('https');

require('../env_loader');
const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

const timestamp = Date.now();
const query = `timestamp=${timestamp}&recvWindow=60000`;
const signature = crypto.createHmac('sha256', SECRET_KEY).update(query).digest('hex');

const options = {
  hostname: 'api.binance.com',
  port: 443,
  path: `/api/v3/account?${query}&signature=${signature}`,
  method: 'GET',
  headers: {
    'X-MBX-APIKEY': API_KEY
  }
};

https.get(options, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', async () => {
    try {
      const acc = JSON.parse(data);
      const nonZero = acc.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
      
      // Get live Doge price
      const dogePrice = await new Promise(r => {
        https.get('https://api.binance.com/api/v3/ticker/price?symbol=DOGEUSDT', res2 => {
          let d2 = '';
          res2.on('data', c => d2 += c);
          res2.on('end', () => r(parseFloat(JSON.parse(d2).price)));
        });
      });

      console.log("═════════════════════════════════════════════════════════════════════════");
      console.log("  💼 BHARAT OS — BINANCE OFFICIAL REAL WALLET LIVE AUDIT");
      console.log("═════════════════════════════════════════════════════════════════════════\n");

      let totalUSD = 0;
      nonZero.forEach(b => {
        const free = parseFloat(b.free);
        let valUSD = free;
        if (b.asset === 'DOGE') {
          valUSD = free * dogePrice;
        }
        totalUSD += valUSD;
        console.log(`  🪙 Asset: ${b.asset.padEnd(6)} | Quantity: ${b.free.padEnd(12)} | Value: $${valUSD.toFixed(4)} USD (₹${(valUSD * 83.5).toFixed(2)} INR)`);
      });

      console.log("\n─────────────────────────────────────────────────────────────────────────");
      console.log(`  💵 TOTAL PORTFOLIO VALUE : $${totalUSD.toFixed(4)} USD (≈ ₹${(totalUSD * 83.5).toFixed(2)} INR)`);
      console.log("═════════════════════════════════════════════════════════════════════════\n");
    } catch (e) {
      console.error(e);
    }
  });
});
