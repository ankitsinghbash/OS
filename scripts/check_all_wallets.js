const crypto = require('crypto');
const https = require('https');
require('../env_loader');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function api(path, method = 'GET', params = {}) {
  return new Promise((resolve, reject) => {
    params.timestamp = Date.now();
    params.recvWindow = 60000;
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const sig = sign(qs);
    const options = {
      hostname: 'api.binance.com',
      port: 443,
      path: `${path}?${qs}&signature=${sig}`,
      method,
      headers: { 'X-MBX-APIKEY': API_KEY }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve({ raw: d }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getPrice(sym) {
  return new Promise(resolve => {
    https.get(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(parseFloat(JSON.parse(d).price)); } catch (e) { resolve(0); }
      });
    }).on('error', () => resolve(0));
  });
}

async function checkAllWallets() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🔍 COMPREHENSIVE WALLET AUDIT ACROSS ALL BINANCE PRODUCT WALLETS");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  let grandTotalUSD = 0;

  // 1. Spot Wallet
  try {
    const spotAcc = await api('/api/v3/account');
    const spotNonZero = (spotAcc.balances || []).filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    console.log("📌 1. SPOT WALLET ASSETS:");
    for (const b of spotNonZero) {
      const tot = parseFloat(b.free) + parseFloat(b.locked);
      let price = 1;
      if (b.asset !== 'USDT' && b.asset !== 'LDUSDT') {
        price = await getPrice(`${b.asset}USDT`);
      }
      const val = tot * price;
      grandTotalUSD += val;
      console.log(`   • ${b.asset.padEnd(8)}: Free=${b.free.padEnd(10)}, Locked=${b.locked.padEnd(10)} | Value = $${val.toFixed(4)} USD`);
    }
  } catch(e) {
    console.log("Spot error:", e.message);
  }

  // 2. Funding Wallet
  try {
    const funding = await api('/sapi/v1/asset/get-funding-asset', 'POST');
    console.log("\n📌 2. FUNDING WALLET ASSETS:");
    if (Array.isArray(funding) && funding.length > 0) {
      for (const b of funding) {
        const tot = parseFloat(b.free) + parseFloat(b.locked || 0) + parseFloat(b.freeze || 0);
        if (tot > 0) {
          let price = 1;
          if (b.asset !== 'USDT') price = await getPrice(`${b.asset}USDT`);
          const val = tot * price;
          grandTotalUSD += val;
          console.log(`   • ${b.asset.padEnd(8)}: Free=${b.free} | Value = $${val.toFixed(4)} USD`);
        }
      }
    } else {
      console.log("   (No funding wallet assets or empty)");
    }
  } catch(e) {
    console.log("Funding error:", e.message);
  }

  // 3. Simple Earn Flexible
  try {
    const earnFlex = await api('/sapi/v1/simple-earn/flexible/position');
    console.log("\n📌 3. SIMPLE EARN (FLEXIBLE):");
    if (earnFlex && earnFlex.rows && earnFlex.rows.length > 0) {
      for (const r of earnFlex.rows) {
        const tot = parseFloat(r.totalAmount || 0);
        let price = 1;
        if (r.asset !== 'USDT') price = await getPrice(`${r.asset}USDT`);
        const val = tot * price;
        console.log(`   • ${r.asset.padEnd(8)}: Amount=${r.totalAmount} | Value = $${val.toFixed(4)} USD`);
      }
    } else {
      console.log("   (No flexible earn rows returned)");
    }
  } catch(e) {
    console.log("Earn flex error:", e.message);
  }

  console.log("\n════════════════════════════════════════════════════════════════════════════════════");
  console.log(`💰 GRAND TOTAL COMBINED NET WORTH: $${grandTotalUSD.toFixed(4)} USD`);
  console.log(`   • In Binance App Display (P2P Rate ≈ ₹95.50/USDT) : ₹${(grandTotalUSD * 95.50).toFixed(2)} INR`);
  console.log(`   • In Official Forex Standard Rate (₹83.50/USD)    : ₹${(grandTotalUSD * 83.50).toFixed(2)} INR`);
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");
}

checkAllWallets().catch(console.error);
