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
              openTime: r[0],
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

async function testOptimalStrategy() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🔬 RESEARCHING OPTIMAL STRATEGIES ON 30-DAY REAL DATA (BTC/FDUSD)");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  const candles = await fetch30Days('BTCFDUSD', '15m');
  console.log(`Loaded ${candles.length} real 15-minute candles (30 Days)\n`);

  const closes = candles.map(c => c.close);
  const startingCapital = 5.80;

  // Let's test different parameter sets:
  // Set 1: Micro-Scalp (TP: 0.8%, SL: 0.5%)
  // Set 2: Swing Trend-Follow (TP: 2.5%, SL: 1.2%, Breakeven Lock at +1.3%)
  // Set 3: Swing Trend-Follow (TP: 3.5%, SL: 1.5%, Breakeven Lock at +1.8%)
  
  const strategies = [
    { name: "Micro Scalp (Tight SL)", tp: 0.008, sl: 0.005, be: 0.005, rsiMax: 45 },
    { name: "Swing Trend (TP 2.0% / SL 1.0%)", tp: 0.020, sl: 0.010, be: 0.010, rsiMax: 45 },
    { name: "Swing Institutional (TP 3.0% / SL 1.5%)", tp: 0.030, sl: 0.015, be: 0.015, rsiMax: 42 }
  ];

  for (const strat of strategies) {
    let balance = startingCapital;
    let inPos = false;
    let entry = 0;
    let beLocked = false;
    let trades = [];

    for (let i = 50; i < candles.length; i++) {
      const sliceCloses = closes.slice(0, i);
      const ema20 = computeEMA(sliceCloses, 20);
      const ema50 = computeEMA(sliceCloses, 50);
      const rsi = computeRSI(sliceCloses, 14);
      const c = candles[i];

      const isUptrend = ema20 > ema50;
      const isDip = rsi <= strat.rsiMax;

      if (!inPos) {
        if (isUptrend && isDip) {
          inPos = true;
          entry = c.close;
          beLocked = false;
        }
      } else {
        const gain = (c.high - entry) / entry;
        const loss = (c.low - entry) / entry;

        // Check Breakeven Lock
        if (!beLocked && gain >= strat.be) {
          beLocked = true;
        }

        // Take Profit
        if (gain >= strat.tp) {
          const prof = balance * strat.tp;
          balance += prof;
          inPos = false;
          trades.push({ type: 'WIN', pnl: prof });
        }
        // Stop Loss or Breakeven Exit
        else if (beLocked && loss <= 0.002) {
          const prof = balance * 0.002;
          balance += prof;
          inPos = false;
          trades.push({ type: 'BREAKEVEN_WIN', pnl: prof });
        } else if (!beLocked && loss <= -strat.sl) {
          const l = balance * strat.sl;
          balance -= l;
          inPos = false;
          trades.push({ type: 'LOSS', pnl: -l });
        }
      }
    }

    const wins = trades.filter(t => t.type === 'WIN' || t.type === 'BREAKEVEN_WIN').length;
    const losses = trades.filter(t => t.type === 'LOSS').length;
    const wr = trades.length > 0 ? (wins / trades.length) * 100 : 0;
    const netUSD = balance - startingCapital;
    const netINR = netUSD * 95.5;

    console.log(`Strategy: ${strat.name}`);
    console.log(`  • Trades: ${trades.length} | Wins: 🟢 ${wins} (${wr.toFixed(1)}%) | Losses: 🔴 ${losses}`);
    console.log(`  • 30-Day Net PnL: ${netUSD >= 0 ? '🟢 +' : '🔴 '}$${netUSD.toFixed(4)} USD (${netUSD >= 0 ? '+' : ''}₹${netINR.toFixed(2)} INR)`);
    console.log(`  • Final Balance : ₹${(balance * 95.5).toFixed(2)} INR (from ₹555.00)\n`);
  }
}

testOptimalStrategy().catch(console.error);
