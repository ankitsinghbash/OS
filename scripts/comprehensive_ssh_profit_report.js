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

async function analyzeAll() {
  const [account, wifTrades, dogeTrades, wifPrice, dogePrice] = await Promise.all([
    api('/api/v3/account'),
    api('/api/v3/myTrades', 'GET', { symbol: 'WIFUSDT', limit: 1000 }),
    api('/api/v3/myTrades', 'GET', { symbol: 'DOGEUSDT', limit: 1000 }),
    getPrice('WIFUSDT'),
    getPrice('DOGEUSDT')
  ]);

  const balances = account.balances ? account.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0) : [];
  
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🚀 BHARAT OS — COMPLETE SSH AUDIT & ACCURATE PROFIT REPORT");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  console.log("📌 1. CURRENT WALLET BALANCES & LIVE NET WORTH:");
  let totalNetWorthUSD = 0;
  for (const b of balances) {
    const free = parseFloat(b.free);
    const locked = parseFloat(b.locked);
    const total = free + locked;
    let price = 0;
    if (b.asset === 'USDT') price = 1;
    else if (b.asset === 'WIF') price = wifPrice;
    else if (b.asset === 'DOGE') price = dogePrice;
    else {
      price = await getPrice(`${b.asset}USDT`);
    }
    const valUSD = total * price;
    totalNetWorthUSD += valUSD;
    console.log(`   • ${b.asset.padEnd(6)}: Free=${free.toFixed(6)}, Locked=${locked.toFixed(6)} | Value: $${valUSD.toFixed(4)} USD (₹${(valUSD * 83.5).toFixed(2)} INR)`);
  }
  console.log(`   💰 TOTAL NET WORTH : $${totalNetWorthUSD.toFixed(4)} USD (₹${(totalNetWorthUSD * 83.5).toFixed(2)} INR)\n`);

  const allTrades = [
    ...(Array.isArray(wifTrades) ? wifTrades.map(t => ({ ...t, sym: 'WIF' })) : []),
    ...(Array.isArray(dogeTrades) ? dogeTrades.map(t => ({ ...t, sym: 'DOGE' })) : [])
  ].sort((a, b) => a.time - b.time);

  console.log(`📌 2. TRADE EXECUTION AUDIT (Total Trades: ${allTrades.length}):\n`);

  // Let's pair up trades into buy/sell cycles (FIFO queue of buys)
  const symbols = ['WIF', 'DOGE'];
  let grandRealizedPnL = 0;
  let grandTotalFees = 0;
  let grandBuyVolume = 0;
  let grandSellVolume = 0;

  for (const sym of symbols) {
    const symTrades = allTrades.filter(t => t.sym === sym);
    if (symTrades.length === 0) continue;

    console.log(`─── Pair: ${sym}USDT (${symTrades.length} fills) ────────────────────────────────────────`);
    
    let buyInventory = []; // { qty, price, quoteQty, fee }
    let closedCycles = [];
    let symFeesUSD = 0;

    for (const t of symTrades) {
      const isBuyer = t.isBuyer;
      const qty = parseFloat(t.qty);
      const price = parseFloat(t.price);
      const quoteQty = parseFloat(t.quoteQty);
      const fee = parseFloat(t.commission);
      let feeUSD = 0;
      if (t.commissionAsset === 'USDT') feeUSD = fee;
      else if (t.commissionAsset === sym) feeUSD = fee * price;
      else if (t.commissionAsset === 'BNB') feeUSD = fee * 650.0;
      symFeesUSD += feeUSD;
      grandTotalFees += feeUSD;

      if (isBuyer) {
        grandBuyVolume += quoteQty;
        buyInventory.push({
          time: t.time,
          orderId: t.orderId,
          qty: qty,
          price: price,
          quoteQty: quoteQty,
          feeUSD: feeUSD,
          remainingQty: qty
        });
      } else {
        grandSellVolume += quoteQty;
        let sellQtyRemaining = qty;
        let matchedCostUSD = 0;
        let matchedBuyFeesUSD = 0;
        let buyTimes = [];

        while (sellQtyRemaining > 1e-7 && buyInventory.length > 0) {
          const oldestBuy = buyInventory[0];
          const matchQty = Math.min(sellQtyRemaining, oldestBuy.remainingQty);
          const fraction = matchQty / oldestBuy.qty;
          
          matchedCostUSD += matchQty * oldestBuy.price;
          matchedBuyFeesUSD += oldestBuy.feeUSD * fraction;
          
          oldestBuy.remainingQty -= matchQty;
          sellQtyRemaining -= matchQty;
          buyTimes.push(oldestBuy.time);

          if (oldestBuy.remainingQty < 1e-7) {
            buyInventory.shift();
          }
        }

        const sellRevenueUSD = qty * price;
        const grossPnL = sellRevenueUSD - matchedCostUSD;
        const totalTradeFees = feeUSD + matchedBuyFeesUSD;
        const netPnL = grossPnL - totalTradeFees;
        grandRealizedPnL += netPnL;

        closedCycles.push({
          sellTime: t.time,
          qty,
          buyPriceAvg: matchedCostUSD / (qty || 1),
          sellPrice: price,
          grossPnL,
          fees: totalTradeFees,
          netPnL,
          orderId: t.orderId
        });
      }
    }

    console.log(`   Completed Closed Cycles: ${closedCycles.length}`);
    closedCycles.forEach((c, idx) => {
      const d = new Date(c.sellTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const pnlSign = c.netPnL >= 0 ? '+' : '';
      const pnlEmoji = c.netPnL >= 0 ? '🟢' : '🔴';
      console.log(`   [Cycle #${(idx+1).toString().padStart(2)}] ${d} | Sold ${c.qty.toFixed(2)} ${sym} @ $${c.sellPrice.toFixed(4)} (Buy avg: $${c.buyPriceAvg.toFixed(4)}) | Net PnL: ${pnlEmoji} ${pnlSign}$${c.netPnL.toFixed(4)} USD (${pnlSign}₹${(c.netPnL * 83.5).toFixed(2)})`);
    });

    const openQty = buyInventory.reduce((acc, b) => acc + b.remainingQty, 0);
    const openCost = buyInventory.reduce((acc, b) => acc + (b.remainingQty * b.price), 0);
    const currentPrice = sym === 'WIF' ? wifPrice : dogePrice;
    const openCurrentVal = openQty * currentPrice;
    const openUnrealizedPnL = openCurrentVal - openCost;

    console.log(`\n   📦 Open / Active Position in ${sym}:`);
    console.log(`      • Holding Qty    : ${openQty.toFixed(4)} ${sym}`);
    console.log(`      • Avg Entry Price: $${(openCost / (openQty || 1)).toFixed(4)}`);
    console.log(`      • Current Price  : $${currentPrice.toFixed(4)}`);
    console.log(`      • Cost Basis     : $${openCost.toFixed(4)} USD`);
    console.log(`      • Current Value  : $${openCurrentVal.toFixed(4)} USD`);
    console.log(`      • Unrealized PnL : ${openUnrealizedPnL >= 0 ? '🟢 +' : '🔴 '}$${openUnrealizedPnL.toFixed(4)} USD (${openUnrealizedPnL >= 0 ? '+' : ''}₹${(openUnrealizedPnL * 83.5).toFixed(2)} INR)\n`);
  }

  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("📊 EXECUTIVE SUMMARY (REAL PROFIT & LOSS BREAKDOWN):");
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log(`  • Total Buy Volume       : $${grandBuyVolume.toFixed(4)} USD (₹${(grandBuyVolume * 83.5).toFixed(2)} INR)`);
  console.log(`  • Total Sell Volume      : $${grandSellVolume.toFixed(4)} USD (₹${(grandSellVolume * 83.5).toFixed(2)} INR)`);
  console.log(`  • Total Exchange Fees    : $${grandTotalFees.toFixed(4)} USD (₹${(grandTotalFees * 83.5).toFixed(2)} INR)`);
  console.log(`  • Net Realized Closed PnL: ${grandRealizedPnL >= 0 ? '🟢 +' : '🔴 '}$${grandRealizedPnL.toFixed(4)} USD (${grandRealizedPnL >= 0 ? '+' : ''}₹${(grandRealizedPnL * 83.5).toFixed(2)} INR)`);
  console.log(`  • Current Spot Net Worth : $${totalNetWorthUSD.toFixed(4)} USD (≈ ₹${(totalNetWorthUSD * 83.5).toFixed(2)} INR)`);
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");
}

analyzeAll().catch(console.error);
