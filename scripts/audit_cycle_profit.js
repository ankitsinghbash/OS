const crypto = require('crypto');
const https = require('https');
require('../env_loader');

const ts = Date.now();
const qs = 'symbol=WIFUSDT&limit=10&timestamp=' + ts + '&recvWindow=60000';
const sig = crypto.createHmac('sha256', process.env.BINANCE_SECRET_KEY).update(qs).digest('hex');

const req = https.request({
  hostname: 'api.binance.com',
  path: '/api/v3/myTrades?' + qs + '&signature=' + sig,
  headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY }
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    try {
      const trades = JSON.parse(b);
      console.log('\n═════════════════════════════════════════════════════════════════════════');
      console.log('  📜 BINANCE OFFICIAL AUDITED TRADE HISTORY (CYCLES #1, #2, #3)');
      console.log('═════════════════════════════════════════════════════════════════════════');
      trades.forEach((t, i) => {
        const type = t.isBuyer ? '🟢 BUY ' : '🔴 SELL';
        const qty = parseFloat(t.qty).toFixed(2);
        const price = parseFloat(t.price).toFixed(4);
        const total = parseFloat(t.quoteQty).toFixed(4);
        console.log(`  [Trade #${i+1}] ${type} ${qty} WIF @ $${price} | Total: $${total} USD | Order: #${t.orderId}`);
      });
      console.log('═════════════════════════════════════════════════════════════════════════\n');
    } catch(e) {
      console.error(e, b);
    }
  });
});
req.end();
