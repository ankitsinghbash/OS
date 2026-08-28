const https = require('https');

https.get('https://api.binance.com/api/v3/exchangeInfo?symbol=DOGEUSDT', res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const s = JSON.parse(data).symbols[0];
    console.log('Symbol:', s.symbol);
    console.log('Base asset precision:', s.baseAssetPrecision);
    console.log('Filters:', s.filters);
  });
});
