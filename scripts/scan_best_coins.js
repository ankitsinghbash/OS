const https = require('https');

https.get('https://api.binance.com/api/v3/ticker/24hr', res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const all = JSON.parse(data);
      // Filter for USDT pairs with high liquidity & tradable with $1 min notional
      const tradableCandidates = [
        'WIFUSDT', 'PEPEUSDT', 'BONKUSDT', 'FLOKIUSDT', 'SHIBUSDT', 
        'DOGEUSDT', 'SUIUSDT', 'NEARUSDT', 'APTUSDT', 'FETUSDT', 'RENDERUSDT', 'TRXUSDT'
      ];
      
      const results = all
        .filter(t => tradableCandidates.includes(t.symbol))
        .map(t => ({
          symbol: t.symbol,
          price: parseFloat(t.lastPrice),
          change24h: parseFloat(t.priceChangePercent),
          quoteVolumeM: (parseFloat(t.quoteVolume) / 1000000).toFixed(1) + 'M'
        }))
        .sort((a, b) => b.change24h - a.change24h);

      console.log("═════════════════════════════════════════════════════════════════════════");
      console.log("  🏆 BINANCE TOP TRADABLE COIN LEADERBOARD (MIN $1 NOTIONAL)");
      console.log("═════════════════════════════════════════════════════════════════════════\n");
      
      results.forEach((r, idx) => {
        const isCurrent = r.symbol === 'WIFUSDT' ? ' 👈 (OUR ACTIVE COIN)' : '';
        const sign = r.change24h >= 0 ? '+' : '';
        console.log(`  ${idx + 1}. ${r.symbol.padEnd(12)} | 24h Gain: ${(sign + r.change24h.toFixed(2) + '%').padEnd(8)} | Price: $${r.price.toString().padEnd(10)} | Vol: ${r.quoteVolumeM}${isCurrent}`);
      });
      console.log("\n═════════════════════════════════════════════════════════════════════════\n");
    } catch(e) {
      console.error(e);
    }
  });
});
