const https = require('https');

function fetchJson(url) {
  return new Promise(r => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { r(JSON.parse(d)); } catch(e) { r({}); }
      });
    }).on('error', () => r({}));
  });
}

async function getLiveBTCFDUSD() {
  const [ticker, book, trades] = await Promise.all([
    fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCFDUSD'),
    fetchJson('https://api.binance.com/api/v3/depth?symbol=BTCFDUSD&limit=5'),
    fetchJson('https://api.binance.com/api/v3/trades?symbol=BTCFDUSD&limit=5')
  ]);

  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  📊 LIVE REAL-TIME MARKET STATUS: BTC / FDUSD (BINANCE)");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  console.log(`📌 1. LIVE PRICE & 24H STATS:`);
  console.log(`   • Current Live Price : $${parseFloat(ticker.lastPrice).toFixed(2)} FDUSD (₹${(parseFloat(ticker.lastPrice) * 95.5 / 1).toLocaleString('en-IN')})`);
  console.log(`   • 24-Hour High       : $${parseFloat(ticker.highPrice).toFixed(2)}`);
  console.log(`   • 24-Hour Low        : $${parseFloat(ticker.lowPrice).toFixed(2)}`);
  console.log(`   • 24-Hour Change     : ${parseFloat(ticker.priceChangePercent) >= 0 ? '🟢 +' : '🔴 '}${parseFloat(ticker.priceChangePercent).toFixed(2)}%`);
  console.log(`   • 24-Hour Volume     : $${(parseFloat(ticker.quoteVolume) / 1e6).toFixed(2)} Million FDUSD (₹${((parseFloat(ticker.quoteVolume) * 95.5) / 1e7).toFixed(1)} Crore INR)`);

  console.log(`\n📌 2. LIVE ORDER BOOK (SPREAD & BID/ASK):`);
  console.log(`   • Best Bid (Buyer)   : $${parseFloat(book.bids[0][0]).toFixed(2)}`);
  console.log(`   • Best Ask (Seller)  : $${parseFloat(book.asks[0][0]).toFixed(2)}`);
  console.log(`   • Spread (Difference): $${(parseFloat(book.asks[0][0]) - parseFloat(book.bids[0][0])).toFixed(2)} (Near-Zero Slippage)`);

  console.log(`\n📌 3. RECENT LIVE FILLS IN MARKET:`);
  if (Array.isArray(trades)) {
    trades.forEach(t => {
      const timeStr = new Date(t.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
      const side = t.isBuyerMaker ? '🔴 SELL' : '🟢 BUY ';
      console.log(`   [${timeStr}] ${side} ${parseFloat(t.qty).toFixed(5)} BTC @ $${parseFloat(t.price).toFixed(2)}`);
    });
  }

  console.log("\n════════════════════════════════════════════════════════════════════════════════════\n");
}

getLiveBTCFDUSD().catch(console.error);
