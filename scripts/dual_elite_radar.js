const https = require('https');

function fetchKlinesChunk(symbol, interval, startTime, limit = 1000) {
  return new Promise(resolve => {
    let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    if (startTime) url += `&startTime=${startTime}`;
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const raw = JSON.parse(d);
          if (Array.isArray(raw)) {
            resolve(raw.map(r => ({
              time: r[0],
              open: parseFloat(r[1]),
              high: parseFloat(r[2]),
              low: parseFloat(r[3]),
              close: parseFloat(r[4]),
              volume: parseFloat(r[5]),
              closeTime: r[6]
            })));
          } else resolve([]);
        } catch(e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

async function fetch30Days(symbol, interval = '15m') {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let startTime = now - thirtyDaysMs;
  let allCandles = [];
  while (startTime < now) {
    const chunk = await fetchKlinesChunk(symbol, interval, startTime, 1000);
    if (!chunk || chunk.length === 0) break;
    allCandles.push(...chunk);
    startTime = chunk[chunk.length - 1].closeTime + 1;
    if (chunk.length < 1000) break;
  }
  return allCandles;
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

async function testDualEliteRadarWithTrailing() {
  const symbols = ['SOLUSDT', 'BTCUSDT'];
  const pairData = {};
  for (const sym of symbols) {
    pairData[sym] = await fetch30Days(sym, '15m');
  }

  const minLength = Math.min(...symbols.map(s => pairData[s].length));
  const startingCapital = 5.80;
  const feePct = 0.002;
  const slPct = 0.015;

  let balance = startingCapital;
  let inPos = false;
  let activeSym = null;
  let entryPrice = 0;
  let maxPriceSeen = 0;
  let trades = [];

  for (let i = 50; i < minLength; i++) {
    if (!inPos) {
      let bestCandidate = null;
      let lowestRSI = 999;
      for (const sym of symbols) {
        const candles = pairData[sym];
        const closes = candles.slice(0, i).map(c => c.close);
        const ema20 = computeEMA(closes, 20);
        const ema50 = computeEMA(closes, 50);
        const rsi = computeRSI(closes, 14);

        if (ema20 > ema50 && rsi <= 45 && rsi < lowestRSI) {
          lowestRSI = rsi;
          bestCandidate = { sym, entry: candles[i].close };
        }
      }
      if (bestCandidate) {
        inPos = true;
        activeSym = bestCandidate.sym;
        entryPrice = bestCandidate.entry;
        maxPriceSeen = entryPrice;
      }
    } else {
      const c = pairData[activeSym][i];
      if (c.high > maxPriceSeen) maxPriceSeen = c.high;

      const maxGain = (maxPriceSeen - entryPrice) / entryPrice;
      const currentGain = (c.close - entryPrice) / entryPrice;
      const currentLoss = (c.low - entryPrice) / entryPrice;

      // Trailing Stop Exit: If gain was >= 3.0%, trail by 1.2% from peak
      if (maxGain >= 0.030 && (maxPriceSeen - c.close) / maxPriceSeen >= 0.012) {
        const exitP = c.close;
        const grossProf = balance * currentGain;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf;
        trades.push({ type: 'TRAILED_WIN', sym: activeSym, gain: currentGain * 100, netProf });
        inPos = false;
        activeSym = null;
      }
      // Fixed Hard TP if explosive candle hit +5%
      else if (maxGain >= 0.055) {
        const grossProf = balance * 0.055;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf;
        trades.push({ type: 'MEGA_WIN', sym: activeSym, gain: 5.5, netProf });
        inPos = false;
        activeSym = null;
      }
      // Stop Loss
      else if (currentLoss <= -slPct) {
        const grossLoss = balance * slPct;
        const fee = balance * feePct;
        const netLoss = grossLoss + fee;
        balance -= netLoss;
        trades.push({ type: 'LOSS', sym: activeSym, gain: -slPct * 100, netProf: -netLoss });
        inPos = false;
        activeSym = null;
      }
    }
  }

  const wins = trades.filter(t => t.netProf > 0).length;
  const losses = trades.filter(t => t.netProf <= 0).length;
  const netUSD = balance - startingCapital;
  const netINR = netUSD * 95.5;

  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("🏆 DUAL-ELITE RADAR (SOL + BTC) WITH TRAILING PROFIT RIDER (30 DAYS):");
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log(`  • Trades: ${trades.length} | Wins: 🟢 ${wins} (${((wins/trades.length)*100).toFixed(1)}%) | Losses: 🔴 ${losses}`);
  console.log(`  • 30-Day Net Pure Profit: 🟢 +$${netUSD.toFixed(4)} USD (+₹${netINR.toFixed(2)} INR)`);
  console.log(`  • Ending Capital: ₹${(balance * 95.5).toFixed(2)} INR (from ₹555.00 INR) | +${((netUSD/startingCapital)*100).toFixed(1)}% Growth\n`);
}

testDualEliteRadarWithTrailing().catch(console.error);
