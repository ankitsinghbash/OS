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
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getPrice(sym) {
  return new Promise((resolve) => {
    https.get(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(parseFloat(JSON.parse(d).price));
        } catch (e) {
          resolve(0.0);
        }
      });
    }).on('error', () => resolve(0.0));
  });
}

async function runDetailedAudit() {
  console.log('════════════════════════════════════════════════════════════════════════════════════');
  console.log('  🔍 BHARAT OS — ACCURATE PROFIT & LOSS AUDIT (SINCE YESTERDAY / 29-30 AUG)');
  console.log('════════════════════════════════════════════════════════════════════════════════════\n');

  // 1. Balances
  const account = await api('/api/v3/account');
  const balances = account.balances ? account.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0) : [];
  
  console.log('📌 1. LIVE WALLET BALANCES:');
  let totalNetWorthUSD = 0;
  for (const b of balances) {
    const free = parseFloat(b.free);
    const locked = parseFloat(b.locked);
    const total = free + locked;
    let price = 0;
    if (b.asset === 'USDT') price = 1;
    else {
      price = await getPrice(`${b.asset}USDT`);
    }
    const valUSD = total * price;
    totalNetWorthUSD += valUSD;
    console.log(`   • ${b.asset.padEnd(6)}: Free = ${free.toFixed(6)}, Locked = ${locked.toFixed(6)} | Value = $${valUSD.toFixed(4)} USD (₹${(valUSD * 83.5).toFixed(2)} INR)`);
  }
  console.log(`   💰 TOTAL SPOT NET WORTH: $${totalNetWorthUSD.toFixed(4)} USD (≈ ₹${(totalNetWorthUSD * 83.5).toFixed(2)} INR)\n`);

  // 2. Fetch all trades from 29 August 00:00 AM IST
  // 29 Aug 00:00 IST = 28 Aug 18:30 UTC = 1787941800000 ms approx
  const startTime = new Date('2026-08-29T00:00:00+05:30').getTime();
  const symbols = ['WIFUSDT', 'SOLUSDT', 'DOGEUSDT'];

  let allTrades = [];
  for (const sym of symbols) {
    try {
      const trades = await api('/api/v3/myTrades', 'GET', { symbol: sym, limit: 200, startTime });
      if (Array.isArray(trades)) {
        trades.forEach(t => allTrades.push({ ...t, sym }));
      }
    } catch (e) {}
  }

  allTrades.sort((a, b) => a.time - b.time);
  console.log(`📌 2. TRADES EXECUTED SINCE YESTERDAY (Total Trades: ${allTrades.length}):\n`);

  let totalBuyVolume = 0;
  let totalSellVolume = 0;
  let totalFeesUSD = 0;
  let totalRealizedPnL = 0;
  let closedCycles = [];

  for (const sym of symbols) {
    const symTrades = allTrades.filter(t => t.sym === sym);
    if (symTrades.length === 0) continue;

    console.log(`─── Pair: ${sym} (${symTrades.length} fills since yesterday) ──────────────────────────────────`);
    let buyInventory = [];

    for (const t of symTrades) {
      const dateStr = new Date(t.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const isBuyer = t.isBuyer;
      const qty = parseFloat(t.qty);
      const price = parseFloat(t.price);
      const quoteQty = parseFloat(t.quoteQty);
      const fee = parseFloat(t.commission);
      let feeUSD = 0;
      if (t.commissionAsset === 'USDT') feeUSD = fee;
      else if (t.commissionAsset === 'WIF') feeUSD = fee * price;
      else if (t.commissionAsset === 'DOGE') feeUSD = fee * price;
      else if (t.commissionAsset === 'BNB') feeUSD = fee * 650.0;
      totalFeesUSD += feeUSD;

      if (isBuyer) {
        totalBuyVolume += quoteQty;
        buyInventory.push({ time: t.time, qty, price, quoteQty, feeUSD, remainingQty: qty });
        console.log(`   [${dateStr}] 🟢 BUY  ${qty.toFixed(2)} ${sym} @ $${price.toFixed(4)} | Total: $${quoteQty.toFixed(2)}`);
      } else {
        totalSellVolume += quoteQty;
        console.log(`   [${dateStr}] 🔴 SELL ${qty.toFixed(2)} ${sym} @ $${price.toFixed(4)} | Total: $${quoteQty.toFixed(2)}`);
        
        let sellQtyRemaining = qty;
        let matchedCostUSD = 0;
        let matchedBuyFeesUSD = 0;

        while (sellQtyRemaining > 1e-7 && buyInventory.length > 0) {
          const oldestBuy = buyInventory[0];
          const matchQty = Math.min(sellQtyRemaining, oldestBuy.remainingQty);
          const fraction = matchQty / oldestBuy.qty;
          matchedCostUSD += matchQty * oldestBuy.price;
          matchedBuyFeesUSD += oldestBuy.feeUSD * fraction;
          oldestBuy.remainingQty -= matchQty;
          sellQtyRemaining -= matchQty;
          if (oldestBuy.remainingQty < 1e-7) buyInventory.shift();
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
  }

  console.log('\n📌 3. COMPLETED CLOSED CYCLES & NET PNL:');
  if (closedCycles.length === 0) {
    console.log('   ℹ️ No closed cycles executed since yesterday.');
  } else {
    closedCycles.forEach((c, idx) => {
      const d = new Date(c.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const pnlSign = c.netPnL >= 0 ? '+' : '';
      const pnlEmoji = c.netPnL >= 0 ? '🟢' : '🔴';
      console.log(`   [Cycle #${(idx + 1).toString().padStart(2)}] ${d} | Sold ${c.qty.toFixed(2)} ${c.sym} @ $${c.sellPrice.toFixed(4)} (Buy: $${c.buyPriceAvg.toFixed(4)}) | Net: ${pnlEmoji} ${pnlSign}$${c.netPnL.toFixed(4)} USD (${pnlSign}₹${(c.netPnL * 83.5).toFixed(2)})`);
    });
  }

  console.log('\n════════════════════════════════════════════════════════════════════════════════════');
  console.log('📊 EXECUTIVE PNL SUMMARY (SINCE YESTERDAY):');
  console.log('════════════════════════════════════════════════════════════════════════════════════');
  console.log(`  • Total Buy Volume       : $${totalBuyVolume.toFixed(4)} USD (₹${(totalBuyVolume * 83.5).toFixed(2)} INR)`);
  console.log(`  • Total Sell Volume      : $${totalSellVolume.toFixed(4)} USD (₹${(totalSellVolume * 83.5).toFixed(2)} INR)`);
  console.log(`  • Total Exchange Fees    : $${totalFeesUSD.toFixed(4)} USD (₹${(totalFeesUSD * 83.5).toFixed(2)} INR)`);
  console.log(`  • Net Realized Closed PnL: ${totalRealizedPnL >= 0 ? '🟢 +' : '🔴 '}$${totalRealizedPnL.toFixed(4)} USD (${totalRealizedPnL >= 0 ? '+' : ''}₹${(totalRealizedPnL * 83.5).toFixed(2)} INR)`);
  console.log(`  • Current Spot Net Worth : $${totalNetWorthUSD.toFixed(4)} USD (≈ ₹${(totalNetWorthUSD * 83.5).toFixed(2)} INR)`);
  console.log('════════════════════════════════════════════════════════════════════════════════════\n');
}

runDetailedAudit().catch(console.error);
