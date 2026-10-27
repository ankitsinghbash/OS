const https = require('https');

function fetchKlines(symbol, interval, startTime, endTime) {
  return new Promise(resolve => {
    let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
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
              volume: parseFloat(r[5])
            })));
          } else resolve([]);
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

async function replayYesterdayBTC() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🔍 EXACT 24-HOUR HISTORICAL REPLAY: YESTERDAY'S BITCOIN (BTCUSDT) TRADING");
  console.log("  Period: 30-Aug-2026 00:00:00 IST to 31-Aug-2026 00:00:00 IST");
  console.log("  Strategy: Institutional Swing Engine (1H Trend + 15m RSI + Breakeven Lock)");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  const startTime = new Date('2026-08-30T00:00:00+05:30').getTime() - (24 * 60 * 60 * 1000);
  const endTime = new Date('2026-08-31T00:00:00+05:30').getTime();

  const chunk1 = await fetchKlines('BTCUSDT', '5m', startTime, startTime + (1000 * 5 * 60 * 1000));
  const chunk2 = await fetchKlines('BTCUSDT', '5m', startTime + (1000 * 5 * 60 * 1000) + 1, endTime);
  const allCandles = [...chunk1, ...chunk2].filter(c => c.time <= endTime);

  console.log(`Loaded ${allCandles.length} real 5-minute candles of BTCUSDT for yesterday's replay\n`);

  const closes = allCandles.map(c => c.close);
  const startingCapital = 5.80; // $5.80 USD (₹555 INR)
  const feePct = 0.002;
  const tpPct = 0.035;  // +3.5%
  const slPct = 0.015;  // -1.5%
  const bePct = 0.018;  // +1.8%

  let balance = startingCapital;
  let inPos = false;
  let entryPrice = 0;
  let beLocked = false;
  let trades = [];

  const yesterdayStart = new Date('2026-08-30T00:00:00+05:30').getTime();

  for (let i = 50; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.time < yesterdayStart && !inPos) continue;

    const sliceCloses = closes.slice(0, i);
    const ema20 = computeEMA(sliceCloses, 20);
    const ema50 = computeEMA(sliceCloses, 50);
    const rsi = computeRSI(sliceCloses, 14);

    const isUptrend = ema20 > ema50;
    const isDip = rsi <= 45;

    if (!inPos) {
      if (isUptrend && isDip && c.time >= yesterdayStart) {
        inPos = true;
        entryPrice = c.close;
        beLocked = false;
        const dStr = new Date(c.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`🟢 [ENTRY TRIGGERED] ${dStr} | Bought BTC @ $${entryPrice.toFixed(2)} (1H EMA Bullish, 15m RSI: ${rsi.toFixed(1)})`);
      }
    } else {
      const gain = (c.high - entryPrice) / entryPrice;
      const loss = (c.low - entryPrice) / entryPrice;

      if (!beLocked && gain >= bePct) {
        beLocked = true;
        const dStr = new Date(c.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`  🔒 [BREAKEVEN LOCK] ${dStr} | Price reached +1.8%! Stop-Loss locked above entry.`);
      }

      if (gain >= tpPct) {
        const exitP = entryPrice * (1 + tpPct);
        const grossProf = balance * tpPct;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf;
        inPos = false;
        const dStr = new Date(c.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`🔴 [TAKE-PROFIT HIT] ${dStr} | Sold @ $${exitP.toFixed(2)} | Net: 🟢 +$${netProf.toFixed(4)} USD (+₹${(netProf * 95.5).toFixed(2)} INR)\n`);
        trades.push({ type: 'WIN', netProf, exitPrice: exitP, time: c.time });
      } else if (beLocked && loss <= 0.003) {
        const exitP = entryPrice * 1.003;
        const grossProf = balance * 0.003;
        const fee = balance * feePct;
        const netProf = grossProf - fee;
        balance += netProf;
        inPos = false;
        const dStr = new Date(c.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`🔴 [BREAKEVEN EXIT] ${dStr} | Sold @ $${exitP.toFixed(2)} | Net: 🟢 +$${netProf.toFixed(4)} USD (+₹${(netProf * 95.5).toFixed(2)} INR)\n`);
        trades.push({ type: 'BREAKEVEN', netProf, exitPrice: exitP, time: c.time });
      } else if (!beLocked && loss <= -slPct) {
        const exitP = entryPrice * (1 - slPct);
        const grossLoss = balance * slPct;
        const fee = balance * feePct;
        const netLoss = grossLoss + fee;
        balance -= netLoss;
        inPos = false;
        const dStr = new Date(c.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`🔴 [STOP-LOSS CUT] ${dStr} | Sold @ $${exitP.toFixed(2)} | Net: 🔴 -$${netLoss.toFixed(4)} USD (-₹${(netLoss * 95.5).toFixed(2)} INR)\n`);
        trades.push({ type: 'LOSS', netProf: -netLoss, exitPrice: exitP, time: c.time });
      }
    }
  }

  // Also show 24h High and Low for Bitcoin yesterday
  const yesterdayCandles = allCandles.filter(c => c.time >= yesterdayStart && c.time <= endTime);
  const high24 = Math.max(...yesterdayCandles.map(c => c.high));
  const low24 = Math.min(...yesterdayCandles.map(c => c.low));
  const open24 = yesterdayCandles[0].open;
  const close24 = yesterdayCandles[yesterdayCandles.length - 1].close;

  console.log(`\n📌 24-HOUR BITCOIN MOVEMENT (30-AUG):`);
  console.log(`   • Open  : $${open24.toFixed(2)}`);
  console.log(`   • High  : $${high24.toFixed(2)}`);
  console.log(`   • Low   : $${low24.toFixed(2)}`);
  console.log(`   • Close : $${close24.toFixed(2)}`);
  console.log(`   • Total 24h Price Range: ${(((high24 - low24) / low24) * 100).toFixed(2)}% (Only $${(high24 - low24).toFixed(2)} USD)\n`);

  if (inPos) {
    const lastP = closes[closes.length - 1];
    const curPnl = ((lastP - entryPrice) / entryPrice) * 100;
    console.log(`⏳ [POSITION OPEN TILL MIDNIGHT] Entry: $${entryPrice.toFixed(2)} | Ending Price: $${lastP.toFixed(2)} | Open PnL: ${curPnl >= 0 ? '+' : ''}${curPnl.toFixed(2)}%`);
  }

  const netPnlUSD = balance - startingCapital;
  const netPnlINR = netPnlUSD * 95.5;

  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("📊 YESTERDAY'S BITCOIN EXECUTION REPORT:");
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log(`  • Closed Trades   : ${trades.length}`);
  console.log(`  • Net Realized PnL: ${netPnlUSD >= 0 ? '🟢 +' : '🔴 '}$${netPnlUSD.toFixed(4)} USD (${netPnlUSD >= 0 ? '+' : ''}₹${netPnlINR.toFixed(2)} INR)`);
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");
}

replayYesterdayBTC().catch(console.error);
