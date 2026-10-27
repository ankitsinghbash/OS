const https = require('https');

function fetchKlines(symbol, interval, limit) {
  return new Promise(resolve => {
    https.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const raw = JSON.parse(d);
          resolve(raw.map(r => ({
            time: r[0],
            open: parseFloat(r[1]),
            high: parseFloat(r[2]),
            low: parseFloat(r[3]),
            close: parseFloat(r[4])
          })));
        } catch(e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

async function simulateSOL() {
  const candles = await fetchKlines('SOLUSDT', '1m', 1000);
  const startingCapital = 5.80;
  const targetPct = 0.015;  // +1.5% Take Profit (+₹8.50)
  const stopLossPct = 0.008;// -0.8% Stop Loss (-₹4.50)
  const feePct = 0.002;     // 0.2% Total Roundtrip Fee

  let balance = startingCapital;
  let inPosition = false;
  let entryPrice = 0;
  let lastSellPrice = candles[0].close;
  let trades = [];

  for (let i = 20; i < candles.length; i++) {
    const c = candles[i];
    if (!inPosition) {
      const localHigh = Math.max(...candles.slice(i - 15, i).map(x => x.high));
      const dipFromHigh = (localHigh - c.low) / localHigh;
      if (dipFromHigh >= 0.008) {
        inPosition = true;
        entryPrice = c.close;
      }
    } else {
      const currentGain = (c.high - entryPrice) / entryPrice;
      const currentLoss = (c.low - entryPrice) / entryPrice;

      if (currentGain >= targetPct) {
        const grossProfit = balance * targetPct;
        const fee = balance * feePct;
        const netProfit = grossProfit - fee;
        balance += netProfit;
        lastSellPrice = entryPrice * (1 + targetPct);
        inPosition = false;
        trades.push({ type: 'WIN', profitUSD: netProfit });
      } else if (currentLoss <= -stopLossPct) {
        const grossLoss = balance * stopLossPct;
        const fee = balance * feePct;
        const netLoss = grossLoss + fee;
        balance -= netLoss;
        lastSellPrice = entryPrice * (1 - stopLossPct);
        inPosition = false;
        trades.push({ type: 'LOSS', profitUSD: -netLoss });
      }
    }
  }

  const wins = trades.filter(t => t.type === 'WIN').length;
  const losses = trades.filter(t => t.type === 'LOSS').length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const netUSD = balance - startingCapital;
  console.log(`\nSOLUSDT REAL CANDLE BACKTEST (Last 16.6 Hours):`);
  console.log(`• Trades: ${trades.length} | Wins: ${wins} (${winRate.toFixed(1)}%) | Losses: ${losses}`);
  console.log(`• Net PnL: ${netUSD >= 0 ? '+' : ''}$${netUSD.toFixed(4)} USD (${netUSD >= 0 ? '+' : ''}₹${(netUSD * 95.5).toFixed(2)} INR)`);
}

simulateSOL().catch(console.error);
