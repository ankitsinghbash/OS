const https = require('https');

function fetchJson(url) {
  return new Promise(resolve => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function compareVolatility() {
  const symbols = ['BTCUSDT', 'SOLUSDT', 'SUIUSDT', 'DOGEUSDT', 'ETHUSDT'];
  console.log("=== 12-HOUR LIVE VOLATILITY COMPARISON ACROSS PAIRS ===");
  
  for (const sym of symbols) {
    const klines = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=15m&limit=48`);
    if (!Array.isArray(klines)) continue;
    let swings06 = 0, swings10 = 0, totalRange = 0;
    klines.forEach(k => {
      const h = parseFloat(k[2]);
      const l = parseFloat(k[3]);
      const r = ((h - l) / l) * 100;
      totalRange += r;
      if (r >= 0.6) swings06++;
      if (r >= 1.0) swings10++;
    });
    const avgR = totalRange / klines.length;
    console.log(`• ${sym.padEnd(9)}: Avg 15m Range = ${avgR.toFixed(2)}% | Dips >= 0.6%: ${swings06} times | Dips >= 1.0%: ${swings10} times`);
  }
}

compareVolatility().catch(console.error);
