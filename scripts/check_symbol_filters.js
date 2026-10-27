const https = require('https');

function checkSymbol(sym) {
  https.get(`https://api.binance.com/api/v3/exchangeInfo?symbol=${sym}`, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try {
        const info = JSON.parse(d);
        const s = info.symbols[0];
        console.log(`=== ${s.symbol} ===`);
        console.log(`Base: ${s.baseAsset}, Quote: ${s.quoteAsset}`);
        console.log(`Base Precision: ${s.baseAssetPrecision}, Quote Precision: ${s.quotePrecision}`);
        for (const f of s.filters) {
          if (['PRICE_FILTER', 'LOT_SIZE', 'MARKET_LOT_SIZE', 'NOTIONAL', 'MIN_NOTIONAL'].includes(f.filterType)) {
            console.log(`Filter [${f.filterType}]:`, f);
          }
        }
      } catch(e) {
        console.error(e);
      }
    });
  });
}

checkSymbol('SOLUSDT');
