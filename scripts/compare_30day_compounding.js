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

function runStrategyOnCandles(candles, startingCapital = 5.80) {
  const closes = candles.map(c => c.close);
  const feePct = 0.002; // 0.20% Roundtrip Spot Fee
  const tpPct = 0.035;  // +3.5%
  const slPct = 0.015;  // -1.5%
  const bePct = 0.018;  // +1.8%

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
    const isDip = rsi <= 45;

    if (!inPos) {
      if (isUptrend && isDip) {
        inPos = true;
        entry = c.close;
        beLocked = false;
      }
    } else {
      const gain = (c.high - entry) / entry;
      const loss = (c.low - entry) / entry;

      if (!beLocked && gain >= bePct) {
        beLocked = true;
      }

      // TP Hit
      if (gain >= tpPct) {
        const grossProf = balance * tpPct;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf; // FULL COMPOUNDING
        inPos = false;
        trades.push({ type: 'WIN', netProf, balance });
      }
      // Breakeven Exit
      else if (beLocked && loss <= 0.003) {
        const grossProf = balance * 0.003;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf; // FULL COMPOUNDING
        inPos = false;
        trades.push({ type: 'BREAKEVEN', netProf, balance });
      }
      // Stop Loss
      else if (!beLocked && loss <= -slPct) {
        const grossLoss = balance * slPct;
        const fee = balance * feePct;
        const netLoss = grossLoss + fee;
        balance -= netLoss; // FULL COMPOUNDING
        inPos = false;
        trades.push({ type: 'LOSS', netProf: -netLoss, balance });
      }
    }
  }

  const wins = trades.filter(t => t.type === 'WIN').length;
  const beWins = trades.filter(t => t.type === 'BREAKEVEN').length;
  const losses = trades.filter(t => t.type === 'LOSS').length;
  const totalWins = wins + beWins;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  const netUSD = balance - startingCapital;
  const netINR = netUSD * 95.5;
  const finalINR = balance * 95.5;

  return {
    totalTrades,
    wins,
    beWins,
    losses,
    winRate,
    startingINR: startingCapital * 95.5,
    finalINR,
    netINR,
    growthPct: ((balance - startingCapital) / startingCapital) * 100
  };
}

async function compareAllCoins30DayCompounding() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🔬 30-DAY MULTI-COIN COMPOUNDING AUDIT (REAL BINANCE CANDLES)");
  console.log("  Starting Capital: ₹555.00 INR ($5.80 USD) | Strategy: Institutional Swing Engine");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  const candidateCoins = ['SOLUSDT', 'SUIUSDT', 'DOGEUSDT', 'BTCUSDT', 'ETHUSDT', 'NEARUSDT'];
  let results = [];

  for (const sym of candidateCoins) {
    console.log(`Downloading 30-day real data for ${sym}...`);
    const candles = await fetch30Days(sym, '15m');
    const stats = runStrategyOnCandles(candles, 5.80);
    results.push({ symbol: sym, ...stats });
  }

  // Sort by final profit
  results.sort((a, b) => b.finalINR - a.finalINR);

  console.log("\n════════════════════════════════════════════════════════════════════════════════════");
  console.log("🏆 30-DAY COMPOUNDING LEADERBOARD (FROM ₹555.00 INITIAL CAPITAL):");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  results.forEach((r, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  ';
    const pnlSign = r.netINR >= 0 ? '+' : '';
    console.log(`${medal} #${idx + 1} ${r.symbol.padEnd(10)} | Final: ₹${r.finalINR.toFixed(2)} INR | Net Profit: ${pnlSign}₹${r.netINR.toFixed(2)} (${pnlSign}${r.growthPct.toFixed(1)}%) | Trades: ${r.totalTrades} (Win Rate: ${r.winRate.toFixed(1)}%)`);
  });

  console.log("\n════════════════════════════════════════════════════════════════════════════════════\n");
}

compareAllCoins30DayCompounding().catch(console.error);
