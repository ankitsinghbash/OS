const https = require('https');

https.get('https://api.binance.com/api/v3/ticker/24hr', res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const all = JSON.parse(data);
      const candidates = ['PEPEUSDT', 'SHIBUSDT', 'BONKUSDT', 'WIFUSDT', 'FLOKIUSDT', 'DOGEUSDT', 'TRXUSDT'];
      
      const results = all.filter(t => candidates.includes(t.symbol)).map(t => ({
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent).toFixed(2) + '%',
        volumeUSD: (parseFloat(t.quoteVolume) / 1000000).toFixed(1) + 'M USD'
      }));

      console.log("═════════════════════════════════════════════════════════════════════════");
      console.log("  📊 TOP HIGH-VOLATILITY TRADABLE PAIRS ON BINANCE (MIN $1 NOTIONAL)");
      console.log("═════════════════════════════════════════════════════════════════════════\n");
      console.table(results);
    } catch(e) {
      console.error(e);
    }
  });
});
