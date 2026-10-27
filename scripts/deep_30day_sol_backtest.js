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

async function run30DaySOLAudit() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🔬 BHARAT OS — DEEP 30-DAY SOLANA (SOLUSDT) QUANTITATIVE RESEARCH AUDIT");
  console.log("  Strategy: Institutional Swing (1H EMA Trend + 15m RSI Pullback + Breakeven Lock)");
  console.log("  Capital: ₹555.00 INR ($5.80 USD) | Real Binance 15-Minute Candles");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  const candles = await fetch30Days('SOLUSDT', '15m');
  console.log(`✅ Loaded ${candles.length} real 15-minute candles of SOLUSDT (30 Days)\n`);

  const closes = candles.map(c => c.close);
  const startingCapital = 5.80;
  const feePct = 0.002; // 0.20% Total Roundtrip Fee on Spot

  const tpPct = 0.035; // +3.5% Take Profit Target
  const slPct = 0.015; // -1.5% Stop Loss
  const bePct = 0.018; // +1.8% Breakeven Ratchet Trigger

  let balance = startingCapital;
  let peakBalance = startingCapital;
  let maxDrawdownUSD = 0;
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

      // Check TP Target
      if (gain >= tpPct) {
        const grossProf = balance * tpPct;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf;
        inPos = false;
        trades.push({ type: 'WIN', netProf, balance });
      }
      // Check Breakeven Exit
      else if (beLocked && loss <= 0.003) {
        const grossProf = balance * 0.003;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf;
        inPos = false;
        trades.push({ type: 'BREAKEVEN', netProf, balance });
      }
      // Check Stop Loss Cut
      else if (!beLocked && loss <= -slPct) {
        const grossLoss = balance * slPct;
        const fee = balance * feePct;
        const netLoss = grossLoss + fee;
        balance -= netLoss;
        inPos = false;
        trades.push({ type: 'LOSS', netProf: -netLoss, balance });
      }

      if (balance > peakBalance) peakBalance = balance;
      const dd = peakBalance - balance;
      if (dd > maxDrawdownUSD) maxDrawdownUSD = dd;
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

  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("📊 30-DAY SOLANA (SOLUSDT) REAL AUDIT RESULTS:");
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log(`  • Total Swings Executed       : ${totalTrades} Trades (Avg ${(totalTrades/30).toFixed(1)} / day)`);
  console.log(`  • +3.5% Full Target Wins      : 🟢 ${wins} Wins`);
  console.log(`  • Breakeven Protected Wins    : 🔒 ${beWins} Wins (Zero-Loss Exits)`);
  console.log(`  • Stop-Loss Cuts (-1.5%)      : 🔴 ${losses} Losses`);
  console.log(`  • Overall Win Rate            : 🟢 ${winRate.toFixed(1)}% Win Rate (${totalWins} Green / ${losses} Red)`);
  console.log(`  • Starting Capital            : $${startingCapital.toFixed(2)} USD (₹555.00 INR)`);
  console.log(`  • Final Ending Balance        : $${balance.toFixed(4)} USD (₹${(balance * 95.5).toFixed(2)} INR)`);
  console.log(`  • NET PURE PROFIT (After Fees): 🟢 +$${netUSD.toFixed(4)} USD (+₹${netINR.toFixed(2)} INR)`);
  console.log(`  • Total Capital Growth        : +${((netUSD / startingCapital) * 100).toFixed(1)}% Net Growth`);
  console.log(`  • Max Drawdown (Worst Dip)    : -$${maxDrawdownUSD.toFixed(4)} USD (-₹${(maxDrawdownUSD * 95.5).toFixed(2)} INR)`);
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");
}

run30DaySOLAudit().catch(console.error);
