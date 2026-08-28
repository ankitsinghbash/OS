const https = require('https');

https.get('https://api.binance.com/api/v3/exchangeInfo', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const info = JSON.parse(data);
      const validPairs = [];
      info.symbols.forEach(s => {
        if (s.quoteAsset === 'USDT' && s.status === 'TRADING') {
          const notional = s.filters.find(f => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');
          if (notional) {
            const minVal = parseFloat(notional.minNotional || notional.notional || '10');
            validPairs.push({ symbol: s.symbol, minNotional: minVal });
          }
        }
      });
      console.log('Total USDT pairs:', validPairs.length);
      console.log('Sample pairs and their min notional:', validPairs.slice(0, 10));
      
      const sub5 = validPairs.filter(p => p.minNotional <= 4.5);
      console.log('Pairs with minNotional <= $4.5:', sub5);
    } catch (e) {
      console.error(e);
    }
  });
});
