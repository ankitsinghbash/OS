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
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
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

async function audit() {
  console.log('════════════════════════════════════════════════════════════════════════════════════');
  console.log('  📊 BHARAT OS — COMPLETE COMPREHENSIVE MULTI-DAY TRADING AUDIT');
  console.log('════════════════════════════════════════════════════════════════════════════════════\n');

  // 1. Balances
  const acc = await api('/api/v3/account');
  const balances = acc.balances ? acc.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0) : [];
  console.log('📌 1. CURRENT WALLET BALANCES:');
  let spotTotalUSD = 0;
  for (const b of balances) {
    const free = parseFloat(b.free);
    const locked = parseFloat(b.locked);
    const total = free + locked;
    let price = 0;
    if (b.asset === 'USDT') price = 1.0;
    else if (b.asset === 'LDUSDT') price = 1.0; // Binance Simple Earn Flexible USDT
    else price = await getPrice(`${b.asset}USDT`);
    const valUSD = total * price;
    spotTotalUSD += valUSD;
    console.log(`   • ${b.asset.padEnd(8)}: Free = ${b.free.padEnd(12)} | Locked = ${b.locked.padEnd(10)} | Value = $${valUSD.toFixed(4)} USD (₹${(valUSD * 83.5).toFixed(2)} INR)`);
  }
  console.log(`   💰 TOTAL ESTIMATED PORTFOLIO VALUE: $${spotTotalUSD.toFixed(4)} USD (≈ ₹${(spotTotalUSD * 83.5).toFixed(2)} INR)\n`);

  // 2. Fetch all trades across candidate pairs
  const symbols = ['WIFUSDT', 'SOLUSDT', 'DOGEUSDT', 'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'PEPEUSDT', 'SHIBUSDT'];
  let allTrades = [];
  for (const sym of symbols) {
    try {
      const trades = await api('/api/v3/myTrades', 'GET', { symbol: sym, limit: 1000 });
      if (Array.isArray(trades)) {
        trades.forEach(t => allTrades.push({ ...t, sym }));
      }
    } catch(e) {}
  }

  allTrades.sort((a, b) => a.time - b.time);
  console.log(`📌 2. TOTAL LIFETIME EXECUTED TRADES IN DATABASE: ${allTrades.length} trades\n`);

  // 3. Group trades by Calendar Day (IST)
  const daysMap = {};
  allTrades.forEach(t => {
    const dStr = new Date(t.time).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: '2-digit' });
    if (!daysMap[dStr]) daysMap[dStr] = [];
    daysMap[dStr].push(t);
  });

  console.log('📌 3. DAILY TRADING BREAKDOWN (IST TIMEZONE):');
  for (const [day, list] of Object.entries(daysMap)) {
    let buyVol = 0, sellVol = 0, buys = 0, sells = 0, fees = 0;
    const pairsSet = new Set();
    list.forEach(t => {
      pairsSet.add(t.sym);
      const q = parseFloat(t.quoteQty);
      const fee = parseFloat(t.commission);
      fees += fee;
      if (t.isBuyer) { buys++; buyVol += q; }
      else { sells++; sellVol += q; }
    });
    console.log(`   🗓️  ${day}:`);
    console.log(`       • Total Fills: ${list.length} (${buys} Buys, ${sells} Sells) on [${Array.from(pairsSet).join(', ')}]`);
    console.log(`       • Buy Volume : $${buyVol.toFixed(2)} USD (₹${(buyVol * 83.5).toFixed(2)})`);
    console.log(`       • Sell Volume: $${sellVol.toFixed(2)} USD (₹${(sellVol * 83.5).toFixed(2)})`);
    console.log(`       • Total Turnover: $${(buyVol + sellVol).toFixed(2)} USD (₹${((buyVol + sellVol) * 83.5).toFixed(2)})`);
  }

  // 4. Detailed analysis of Kal (Yesterday: 30 Aug 2026) and Aaj (Today: 31 Aug 2026) and 29 Aug 2026
  console.log('\n📌 4. RECENT TRADES DETAIL (LAST 30 EXECUTED FILLS):');
  const recent = allTrades.slice(-30);
  if (recent.length === 0) {
    console.log('   ℹ️ No recent trades found.');
  } else {
    recent.forEach((t, i) => {
      const timeStr = new Date(t.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const side = t.isBuyer ? '🟢 BUY ' : '🔴 SELL';
      console.log(`   [#${(allTrades.length - recent.length + i + 1).toString().padStart(3)}] ${timeStr} | ${side} ${parseFloat(t.qty).toFixed(4)} ${t.sym} @ $${parseFloat(t.price).toFixed(4)} | Value: $${parseFloat(t.quoteQty).toFixed(2)}`);
    });
  }

  // 5. FIFO PnL cycle calculation
  let buyInventory = {};
  let closedCycles = [];
  let totalRealizedPnL = 0;
  let totalFeesUSD = 0;

  for (const t of allTrades) {
    const sym = t.sym;
    if (!buyInventory[sym]) buyInventory[sym] = [];
    const isBuyer = t.isBuyer;
    const qty = parseFloat(t.qty);
    const price = parseFloat(t.price);
    const quoteQty = parseFloat(t.quoteQty);
    const fee = parseFloat(t.commission);
    let feeUSD = fee;
    if (t.commissionAsset === 'USDT' || t.commissionAsset === 'LDUSDT') feeUSD = fee;
    else feeUSD = fee * price;
    totalFeesUSD += feeUSD;

    if (isBuyer) {
      buyInventory[sym].push({ time: t.time, qty, price, quoteQty, feeUSD, remainingQty: qty });
    } else {
      let sellQtyRemaining = qty;
      let matchedCostUSD = 0;
      let matchedBuyFeesUSD = 0;

      while (sellQtyRemaining > 1e-7 && buyInventory[sym].length > 0) {
        const oldestBuy = buyInventory[sym][0];
        const matchQty = Math.min(sellQtyRemaining, oldestBuy.remainingQty);
        const fraction = matchQty / oldestBuy.qty;
        matchedCostUSD += matchQty * oldestBuy.price;
        matchedBuyFeesUSD += oldestBuy.feeUSD * fraction;
        oldestBuy.remainingQty -= matchQty;
        sellQtyRemaining -= matchQty;
        if (oldestBuy.remainingQty < 1e-7) buyInventory[sym].shift();
      }

      const sellRevenue = qty * price;
      const grossPnL = sellRevenue - matchedCostUSD;
      const netPnL = grossPnL - (feeUSD + matchedBuyFeesUSD);
      totalRealizedPnL += netPnL;

      closedCycles.push({
        time: t.time,
        sym,
        qty,
        buyPriceAvg: matchedCostUSD / (qty || 1),
        sellPrice: price,
        netPnL
      });
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════════════════════════');
  console.log('📈 ALL-TIME REALIZED PNL SUMMARY:');
  console.log('════════════════════════════════════════════════════════════════════════════════════');
  console.log(`  • Total Closed Trade Cycles : ${closedCycles.length}`);
  console.log(`  • Net Realized Profit (PnL) : ${totalRealizedPnL >= 0 ? '🟢 +' : '🔴 '}$${totalRealizedPnL.toFixed(4)} USD (${totalRealizedPnL >= 0 ? '+' : ''}₹${(totalRealizedPnL * 83.5).toFixed(2)} INR)`);
  console.log(`  • Estimated Total Fees Paid : $${totalFeesUSD.toFixed(4)} USD (₹${(totalFeesUSD * 83.5).toFixed(2)} INR)`);
  console.log('════════════════════════════════════════════════════════════════════════════════════\n');
}

audit().catch(console.error);
