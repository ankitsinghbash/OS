const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const env = {};
fs.readFileSync('/home/bharatos_user/bharatos/.env', 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=');
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const KEY = env.BINANCE_API_KEY;
const SECRET = env.BINANCE_SECRET_KEY;

function sign(p) {
  const qs = Object.entries({ ...p, timestamp: Date.now(), recvWindow: 10000 })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return qs + '&signature=' + crypto.createHmac('sha256', SECRET).update(qs).digest('hex');
}

function get(host, path_, auth) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'BharatOS/1.0' };
    if (auth) headers['X-MBX-APIKEY'] = KEY;
    https.get({ hostname: host, path: path_, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

async function main() {
  console.log('\n=== 💼 FULL BINANCE WALLET AUDIT ===\n');

  // Spot balances
  const spotAcct = await get('api.binance.com', `/api/v3/account?${sign({})}`, true);
  const nonZero = spotAcct.balances.filter(b => parseFloat(b.free) > 0.000001 || parseFloat(b.locked) > 0.000001);

  console.log('📦 SPOT WALLET (Non-zero balances):');
  console.log('─────────────────────────────────────────────────────');

  // Get prices for all non-USDT/FDUSD coins
  const tickers = await get('api.binance.com', '/api/v3/ticker/price', false);
  const priceMap = {};
  if (Array.isArray(tickers)) tickers.forEach(t => { priceMap[t.symbol] = parseFloat(t.price); });

  let totalUSD = 0;
  const sellable = [];

  for (const b of nonZero) {
    const free = parseFloat(b.free);
    const locked = parseFloat(b.locked);
    const total = free + locked;

    let usdValue = 0;
    if (b.asset === 'USDT' || b.asset === 'FDUSD') {
      usdValue = total;
    } else {
      const price = priceMap[b.asset + 'USDT'] || priceMap[b.asset + 'FDUSD'] || 0;
      usdValue = total * price;
    }

    const inr = usdValue * 95.07;
    totalUSD += usdValue;

    console.log(`  ${b.asset.padEnd(10)} Free: ${String(free).padEnd(18)} Locked: ${String(locked).padEnd(10)} ≈ $${usdValue.toFixed(4)} (₹${inr.toFixed(2)})`);

    if (b.asset !== 'USDT' && b.asset !== 'FDUSD' && usdValue > 0.5) {
      sellable.push({ asset: b.asset, qty: free, usdValue });
    }
  }

  console.log('─────────────────────────────────────────────────────');
  console.log(`  TOTAL SPOT VALUE: $${totalUSD.toFixed(4)} USD (₹${(totalUSD * 95.07).toFixed(2)} INR)`);

  // Futures balance
  const futAcct = await get('fapi.binance.com', `/fapi/v2/account?${sign({})}`, true);
  let futUSDT = 0;
  if (futAcct && Array.isArray(futAcct.assets)) {
    const u = futAcct.assets.find(a => a.asset === 'USDT');
    if (u) futUSDT = parseFloat(u.walletBalance);
  }
  console.log(`\n📊 FUTURES WALLET: $${futUSDT.toFixed(4)} USDT`);

  const grandTotal = totalUSD + futUSDT;
  console.log(`\n💰 GRAND TOTAL: $${grandTotal.toFixed(4)} USD (₹${(grandTotal * 95.07).toFixed(2)} INR)`);

  if (sellable.length > 0) {
    console.log('\n🔄 COINS THAT CAN BE SOLD TO USDT:');
    sellable.forEach(s => {
      console.log(`  → ${s.asset}: ${s.qty} units ≈ $${s.usdValue.toFixed(4)} (₹${(s.usdValue * 95.07).toFixed(2)})`);
    });
    const sellableTotal = sellable.reduce((a, s) => a + s.usdValue, 0);
    console.log(`  TOTAL SELLABLE: $${sellableTotal.toFixed(4)} USD\n`);
  } else {
    console.log('\n⚠️  No significant coin holdings found to convert to USDT.');
    console.log('   You will need to deposit fresh funds to start the bot.\n');
  }
}

main().catch(console.error);
