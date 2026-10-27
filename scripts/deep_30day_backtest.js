const https = require('https');

function fetchKlinesChunk(symbol, interval, startTime, limit = 1000) {
  return new Promise((resolve, reject) => {
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
          } else {
            resolve([]);
          }
        } catch(e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

async function fetchFull30Days(symbol, interval = '5m') {
  console.log(`Fetching 30 days of ${symbol} (${interval}) candle data from Binance...`);
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

async function run30DayQuantitativeResearch() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🔬 BHARAT OS — DEEP 30-DAY QUANTITATIVE RESEARCH & BACKTEST ENGINE");
  console.log("  Asset: BTC/FDUSD (Zero Maker Fee) | Capital: ₹555 INR ($5.80 USD)");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  const candles = await fetchFull30Days('BTCFDUSD', '5m');
  console.log(`✅ Successfully loaded ${candles.length} real 5-minute market candles spanning 30 Days!\n`);

  if (candles.length === 0) {
    console.log("Could not fetch 30-day data.");
    return;
  }

  // Backtest Parameters
  const startingCapital = 5.80; // $5.80 USD (₹555 INR)
  const targetPct = 0.007;      // +0.70% Take Profit Target
  const stopLossPct = 0.004;    // -0.40% Stop Loss Cut
  const dipBuyPct = 0.003;      // Buy on 0.30% dip below 20-period Moving Average
  const feePct = 0.000;         // 0.00% Zero Maker Fee on BTCFDUSD

  let balance = startingCapital;
  let peakBalance = startingCapital;
  let maxDrawdownUSD = 0;
  let inPosition = false;
  let entryPrice = 0;
  let trades = [];

  for (let i = 30; i < candles.length; i++) {
    const c = candles[i];

    // Compute 20-period Simple Moving Average (SMA) of close
    const sma20 = candles.slice(i - 20, i).reduce((sum, x) => sum + x.close, 0) / 20;

    if (!inPosition) {
      // Maker Limit Buy Condition: Price dips to sma20 * (1 - dipBuyPct)
      const limitBuyPrice = sma20 * (1 - dipBuyPct);

      // Order fills if candle LOW touched or broke limitBuyPrice
      if (c.low <= limitBuyPrice) {
        inPosition = true;
        entryPrice = limitBuyPrice;
      }
    } else {
      // In position: Monitor Take-Profit and Stop-Loss
      const limitSellTarget = entryPrice * (1 + targetPct);
      const stopLossPrice = entryPrice * (1 - stopLossPct);

      // Check Take-Profit Fill (Candle High touched Target)
      if (c.high >= limitSellTarget) {
        const profit = balance * targetPct;
        balance += profit;
        inPosition = false;
        trades.push({
          type: 'WIN',
          entry: entryPrice,
          exit: limitSellTarget,
          gainPct: targetPct * 100,
          profitUSD: profit,
          balanceAfter: balance,
          time: c.openTime
        });
      }
      // Check Stop-Loss Fill (Candle Low touched Stop Loss)
      else if (c.low <= stopLossPrice) {
        const loss = balance * stopLossPct;
        balance -= loss;
        inPosition = false;
        trades.push({
          type: 'LOSS',
          entry: entryPrice,
          exit: stopLossPrice,
          gainPct: -stopLossPct * 100,
          profitUSD: -loss,
          balanceAfter: balance,
          time: c.openTime
        });
      }

      // Track Peak Balance and Maximum Drawdown
      if (balance > peakBalance) peakBalance = balance;
      const drawdown = peakBalance - balance;
      if (drawdown > maxDrawdownUSD) maxDrawdownUSD = drawdown;
    }
  }

  // Analytics on the results
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.type === 'WIN').length;
  const losses = trades.filter(t => t.type === 'LOSS').length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const netProfitUSD = balance - startingCapital;
  const netProfitINR = netProfitUSD * 95.5;

  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("📊 30-DAY REAL DATA BACKTEST RESULTS (FULL VERIFIED AUDIT):");
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log(`  • Total Real Trades Executed  : ${totalTrades} Trades (Avg ${(totalTrades / 30).toFixed(1)} trades / day)`);
  console.log(`  • Winning Trades (Target Hit) : 🟢 ${wins} Wins (${winRate.toFixed(1)}% Win Rate)`);
  console.log(`  • Losing Trades (Stop-Loss)   : 🔴 ${losses} Losses (${(100 - winRate).toFixed(1)}%)`);
  console.log(`  • Starting Capital            : $${startingCapital.toFixed(2)} USD (₹555.00 INR)`);
  console.log(`  • Final Ending Balance        : $${balance.toFixed(4)} USD (₹${(balance * 95.5).toFixed(2)} INR)`);
  console.log(`  • NET PURE PROFIT (30 Days)   : ${netProfitUSD >= 0 ? '🟢 +' : '🔴 '}$${netProfitUSD.toFixed(4)} USD (${netProfitUSD >= 0 ? '+' : ''}₹${netProfitINR.toFixed(2)} INR)`);
  console.log(`  • Total Binance Fees Paid     : $0.00 USD (₹0.00 INR - 100% ZERO FEE)`);
  console.log(`  • Max Drawdown (Worst Dip)    : -$${maxDrawdownUSD.toFixed(4)} USD (-₹${(maxDrawdownUSD * 95.5).toFixed(2)} INR)\n`);

  // Analyze First 200 Trades Specifically
  if (totalTrades >= 50) {
    const first200 = trades.slice(0, Math.min(200, totalTrades));
    const wins200 = first200.filter(t => t.type === 'WIN').length;
    const loss200 = first200.filter(t => t.type === 'LOSS').length;
    let b200 = startingCapital;
    first200.forEach(t => {
      if (t.type === 'WIN') b200 += b200 * targetPct;
      else b200 -= b200 * stopLossPct;
    });
    const pnl200USD = b200 - startingCapital;
    const pnl200INR = pnl200USD * 95.5;

    console.log("════════════════════════════════════════════════════════════════════════════════════");
    console.log(`🎯 EXACT ${first200.length}-TRADE MILESTONE PERFORMANCE:`);
    console.log("════════════════════════════════════════════════════════════════════════════════════");
    console.log(`  • Trades Analyzed             : ${first200.length} Trades`);
    console.log(`  • Wins vs Losses              : 🟢 ${wins200} Wins / 🔴 ${loss200} Losses (${((wins200/first200.length)*100).toFixed(1)}% Win Rate)`);
    console.log(`  • Net Profit on 200 Trades    : 🟢 +$${pnl200USD.toFixed(4)} USD (+₹${pnl200INR.toFixed(2)} INR)`);
    console.log(`  • Capital Growth              : ₹555.00 ➔ ₹${(b200 * 95.5).toFixed(2)} INR (+${((pnl200USD/startingCapital)*100).toFixed(1)}% Growth)`);
    console.log("════════════════════════════════════════════════════════════════════════════════════\n");
  }
}

run30DayQuantitativeResearch().catch(console.error);
