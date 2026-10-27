const https = require('https');

function getKlines(symbol, interval, limit) {
  return new Promise(resolve => {
    https.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const raw = JSON.parse(d);
          const closes = raw.map(r => parseFloat(r[4]));
          resolve(closes);
        } catch(e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

function computeEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * k) + (ema * (1 - k));
  }
  return ema;
}

function computeRSI(prices, period = 14) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

async function auditBtc() {
  const [h1, m15] = await Promise.all([
    getKlines('BTCUSDT', '1h', 60),
    getKlines('BTCUSDT', '15m', 60)
  ]);

  const currentPrice = m15[m15.length - 1];
  const ema20 = computeEMA(h1, 20);
  const ema50 = computeEMA(h1, 50);
  const rsi15 = computeRSI(m15, 14);

  const entry = 78575.99;
  const target = 81326.15;
  const stopLoss = 77397.35;
  const pnlPct = ((currentPrice - entry) / entry) * 100;
  const pnlINR = (currentPrice - entry) * 0.00006 * 83.5;

  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🛡️ BITCOIN (BTCUSDT) LIVE RISK & SAFETY AUDIT");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  console.log(`📌 1. LIVE MARKET METRICS:`);
  console.log(`   • Current BTC Price   : $${currentPrice.toFixed(2)} USD`);
  console.log(`   • 1-Hour Trend        : ${ema20 >= ema50 ? '🟢 BULLISH (EMA20 > EMA50)' : '🔴 BEARISH/CONSOLIDATING'}`);
  console.log(`   • 1-Hour EMA 20       : $${ema20.toFixed(2)}`);
  console.log(`   • 1-Hour EMA 50       : $${ema50.toFixed(2)}`);
  console.log(`   • 15-Min RSI Dip Score: ${rsi15.toFixed(2)} (${rsi15 <= 45 ? '🟢 Ideal Swing Dip Range' : '⚪ Neutral'})`);

  console.log(`\n📌 2. LIVE POSITION STATUS:`);
  console.log(`   • Entry Price         : $${entry.toFixed(2)}`);
  console.log(`   • Current Price       : $${currentPrice.toFixed(2)}`);
  console.log(`   • Live PnL            : ${pnlPct >= 0 ? '🟢 +' : '🔴 '}${pnlPct.toFixed(2)}% (${pnlPct >= 0 ? '+' : ''}₹${pnlINR.toFixed(2)} INR)`);
  console.log(`   • Target Exit (+3.5%) : $${target.toFixed(2)} (+₹16.00 to ₹20.00 INR Profit)`);
  console.log(`   • Stop-Loss (-1.5%)   : $${stopLoss.toFixed(2)} (Max Loss Cap: -₹6.00 to -₹7.00 INR)`);

  console.log(`\n════════════════════════════════════════════════════════════════════════════════════\n`);
}

auditBtc().catch(console.error);
