const https = require('https');

https.get('https://api.binance.com/api/v3/exchangeInfo', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const info = JSON.parse(d);
    const btr = info.symbols.filter(s => s.symbol.includes('BTR') && s.status === 'TRADING');
    console.log("BTR pairs on Binance:", btr.map(s => s.symbol));
  });
});
