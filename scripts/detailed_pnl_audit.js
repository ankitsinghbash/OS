const crypto = require('crypto');
const https = require('https');
require('../env_loader');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function getTrades(symbol) {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const qs = `symbol=${symbol}&limit=50&timestamp=${ts}&recvWindow=60000`;
    const signature = sign(qs);

    const options = {
      hostname: 'api.binance.com',
      port: 443,
      path: `/api/v3/myTrades?${qs}&signature=${signature}`,
      method: 'GET',
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

function getPrice(symbol) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(parseFloat(JSON.parse(d).price)));
    }).on('error', reject);
  });
}

async function runAudit() {
  console.log("═════════════════════════════════════════════════════════════════════════");
  console.log("  📊 BHARAT OS — 24-HOUR OFFICIAL BINANCE PnL & TRADE AUDIT");
  console.log("═════════════════════════════════════════════════════════════════════════\n");

  const wifTrades = await getTrades('WIFUSDT');
  const dogeTrades = await getTrades('DOGEUSDT');
  const currentWifPrice = await getPrice('WIFUSDT');

  const allTrades = [
    ...(Array.isArray(wifTrades) ? wifTrades.map(t => ({ ...t, sym: 'WIF' })) : []),
    ...(Array.isArray(dogeTrades) ? dogeTrades.map(t => ({ ...t, sym: 'DOGE' })) : [])
  ].sort((a, b) => a.time - b.time);

  console.log(`Total Executed Orders in Record: ${allTrades.length}\n`);

  let totalBoughtUSD = 0;
  let totalSoldUSD = 0;
  let totalFeesUSD = 0;

  allTrades.forEach((t, i) => {
    const d = new Date(t.time);
    const dateStr = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const side = t.isBuyer ? '🟢 BUY ' : '🔴 SELL';
    const qty = parseFloat(t.qty);
    const price = parseFloat(t.price);
    const quoteQty = parseFloat(t.quoteQty);
    const fee = parseFloat(t.commission);

    if (t.isBuyer) {
      totalBoughtUSD += quoteQty;
    } else {
      totalSoldUSD += quoteQty;
    }

    let feeUSD = 0;
    if (t.commissionAsset === 'USDT') feeUSD = fee;
    else if (t.commissionAsset === 'BNB') feeUSD = fee * 650.0;
    else if (t.commissionAsset === t.sym) feeUSD = fee * price;
    totalFeesUSD += feeUSD;

    console.log(`[#${(i+1).toString().padStart(2)}] ${dateStr} | ${side} ${qty.toFixed(2).padStart(6)} ${t.sym} @ $${price.toFixed(4)} | Total: $${quoteQty.toFixed(4)} | Fee: ${fee.toFixed(6)} ${t.commissionAsset}`);
  });

  // Real Cash Flow Analysis
  const netCashflow = totalSoldUSD - totalBoughtUSD;
  const netFees = totalFeesUSD;
  const netProfit = netCashflow - netFees;

  console.log(`  • Total 24h Trading Turnover: $${(totalSoldUSD + totalBoughtUSD).toFixed(4)} USD (₹${((totalSoldUSD + totalBoughtUSD) * 83.5).toFixed(2)} INR)`);
  console.log(`  • Total Sold Volume (Exits) : $${totalSoldUSD.toFixed(4)} USD`);
  console.log(`  • Total Bought Volume (Dips): $${totalBoughtUSD.toFixed(4)} USD`);
  console.log(`  • Total Exchange Fees Paid  : $${totalFeesUSD.toFixed(4)} USD (₹${(totalFeesUSD * 83.5).toFixed(2)} INR)`);
  console.log(`  • Net Cashflow Spread (P&L) : ${netCashflow >= 0 ? '+' : ''}$${netCashflow.toFixed(4)} USD (${netCashflow >= 0 ? '+' : ''}₹${(netCashflow * 83.5).toFixed(2)} INR)`);
  console.log(`  • Net Realized Profit (Post): ${netProfit >= 0 ? '🟢 +' : '🔴 '}$${netProfit.toFixed(4)} USD (≈ ₹${(netProfit * 83.5).toFixed(2)} INR)`);
  console.log("═════════════════════════════════════════════════════════════════════════\n");
}

runAudit().catch(console.error);
