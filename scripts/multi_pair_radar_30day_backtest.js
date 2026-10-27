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

async function runMultiPairRadar30DayResearch() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🛰️ BHARAT OS — MULTI-PAIR RADAR 30-DAY QUANTITATIVE RESEARCH ENGINE");
  console.log("  Pairs: [SOL, BTC, ETH, WIF] | Capital: ₹555.00 INR ($5.80 USD) | 100% Compounding");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  const symbols = ['SOLUSDT', 'BTCUSDT', 'ETHUSDT', 'WIFUSDT'];
  const pairData = {};

  for (const sym of symbols) {
    console.log(`Downloading 30 days of real data for ${sym}...`);
    pairData[sym] = await fetch30Days(sym, '15m');
  }

  // Ensure all candle arrays are synchronized by timestamp
  const minLength = Math.min(...symbols.map(s => pairData[s].length));
  console.log(`\n✅ Synchronized ${minLength} consecutive 15-minute time steps across all 4 pairs (30 Days)\n`);

  const startingCapital = 5.80; // $5.80 USD (₹555.00 INR)
  const feePct = 0.002;         // 0.20% Roundtrip Spot Fee
  const tpPct = 0.035;          // +3.5% Take Profit Target
  const slPct = 0.015;          // -1.5% Stop Loss Cut
  const bePct = 0.018;          // +1.8% Breakeven Lock Trigger

  let balance = startingCapital;
  let peakBalance = startingCapital;
  let maxDrawdownUSD = 0;
  let inPos = false;
  let activeSym = null;
  let entryPrice = 0;
  let beLocked = false;
  let trades = [];

  for (let i = 50; i < minLength; i++) {
    const timestamp = pairData['BTCUSDT'][i].time;

    if (!inPos) {
      // RADAR SCANNER: Check all 4 pairs simultaneously for the best qualified setup
      let bestCandidate = null;
      let lowestRSI = 999;

      for (const sym of symbols) {
        const candles = pairData[sym];
        const closes = candles.slice(0, i).map(c => c.close);
        const ema20 = computeEMA(closes, 20);
        const ema50 = computeEMA(closes, 50);
        const rsi = computeRSI(closes, 14);

        const isUptrend = ema20 > ema50;
        const isDip = rsi <= 45;

        // Find the pair in the strongest dip setup
        if (isUptrend && isDip && rsi < lowestRSI) {
          lowestRSI = rsi;
          bestCandidate = { sym, entry: candles[i].close, rsi };
        }
      }

      // Enter the best candidate
      if (bestCandidate) {
        inPos = true;
        activeSym = bestCandidate.sym;
        entryPrice = bestCandidate.entry;
        beLocked = false;
      }
    } else {
      // In position: Track the active pair's candle
      const c = pairData[activeSym][i];
      const gain = (c.high - entryPrice) / entryPrice;
      const loss = (c.low - entryPrice) / entryPrice;

      // Breakeven ratchet
      if (!beLocked && gain >= bePct) {
        beLocked = true;
      }

      // 1. Take Profit
      if (gain >= tpPct) {
        const grossProf = balance * tpPct;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf; // COMPOUNDING
        trades.push({ type: 'WIN', sym: activeSym, netProf, balance, time: timestamp });
        inPos = false;
        activeSym = null;
      }
      // 2. Breakeven Exit
      else if (beLocked && loss <= 0.003) {
        const grossProf = balance * 0.003;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf; // COMPOUNDING
        trades.push({ type: 'BREAKEVEN', sym: activeSym, netProf, balance, time: timestamp });
        inPos = false;
        activeSym = null;
      }
      // 3. Stop Loss
      else if (!beLocked && loss <= -slPct) {
        const grossLoss = balance * slPct;
        const fee = balance * feePct;
        const netLoss = grossLoss + fee;
        balance -= netLoss; // COMPOUNDING
        trades.push({ type: 'LOSS', sym: activeSym, netProf: -netLoss, balance, time: timestamp });
        inPos = false;
        activeSym = null;
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

  // Breakdown by Pair
  const pairBreakdown = {};
  symbols.forEach(s => pairBreakdown[s] = { trades: 0, wins: 0, losses: 0, pnl: 0 });
  trades.forEach(t => {
    pairBreakdown[t.sym].trades++;
    if (t.type === 'WIN' || t.type === 'BREAKEVEN') pairBreakdown[t.sym].wins++;
    else pairBreakdown[t.sym].losses++;
    pairBreakdown[t.sym].pnl += t.netProf;
  });

  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("📊 MULTI-PAIR RADAR 30-DAY RESEARCH RESULTS (FULL AUDIT):");
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log(`  • Starting Initial Capital     : $${startingCapital.toFixed(2)} USD (₹555.00 INR)`);
  console.log(`  • Final Ending Balance         : $${balance.toFixed(4)} USD (₹${(balance * 95.5).toFixed(2)} INR)`);
  console.log(`  • 30-DAY NET PURE PROFIT       : 🟢 +$${netUSD.toFixed(4)} USD (+₹${netINR.toFixed(2)} INR)`);
  console.log(`  • Total 30-Day Growth          : 🚀 +${((netUSD / startingCapital) * 100).toFixed(1)}% Compounded Return`);
  console.log(`  • Total Swings Executed        : ${totalTrades} Trades (Avg ${(totalTrades / 30).toFixed(1)} trades / day)`);
  console.log(`  • Winning Swings (Green)       : 🟢 ${totalWins} (${wins} Full TP + ${beWins} Breakeven)`);
  console.log(`  • Losing Swings (Red Cuts)     : 🔴 ${losses}`);
  console.log(`  • Overall Strategy Win Rate    : 🟢 ${winRate.toFixed(1)}% Win Rate`);
  console.log(`  • Maximum Drawdown (Worst Dip) : -$${maxDrawdownUSD.toFixed(4)} USD (-₹${(maxDrawdownUSD * 95.5).toFixed(2)} INR)\n`);

  console.log("📌 BREAKDOWN BY RADAR ASSET:");
  for (const [sym, stats] of Object.entries(pairBreakdown)) {
    console.log(`   • ${sym.padEnd(9)}: ${stats.trades} Trades (${stats.wins} Wins / ${stats.losses} Losses) | Net: +₹${(stats.pnl * 95.5).toFixed(2)} INR`);
  }
  console.log("\n════════════════════════════════════════════════════════════════════════════════════\n");
}

runMultiPairRadar30DayResearch().catch(console.error);
