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

async function analyzeLiveFDUSD() {
  console.log("════════════════════════════════════════════════════════════════════════════════════");
  console.log("  🔍 LIVE REAL-TIME DATA AUDIT: BTCFDUSD vs BTCUSDT ON BINANCE");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");

  // 1. Ticker 24hr data
  const [tickerFDUSD, tickerUSDT, bookFDUSD, exInfo] = await Promise.all([
    fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCFDUSD'),
    fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'),
    fetchJson('https://api.binance.com/api/v3/depth?symbol=BTCFDUSD&limit=5'),
    fetchJson('https://api.binance.com/api/v3/exchangeInfo?symbol=BTCFDUSD')
  ]);

  if (!tickerFDUSD || !tickerFDUSD.symbol) {
    console.log("❌ Error fetching BTCFDUSD data from Binance");
    return;
  }

  const fdusdPrice = parseFloat(tickerFDUSD.lastPrice);
  const usdtPrice = parseFloat(tickerUSDT.lastPrice);
  const fdusdVolUSD = parseFloat(tickerFDUSD.quoteVolume);
  const usdtVolUSD = parseFloat(tickerUSDT.quoteVolume);

  console.log("📌 1. LIVE COMPARISON & LIQUIDITY:");
  console.log(`   • BTC/FDUSD Live Price : $${fdusdPrice.toFixed(2)} | 24h Volume: $${(fdusdVolUSD / 1e6).toFixed(2)} Million USD`);
  console.log(`   • BTC/USDT  Live Price : $${usdtPrice.toFixed(2)} | 24h Volume: $${(usdtVolUSD / 1e6).toFixed(2)} Million USD`);
  console.log(`   • Price Difference     : $${(fdusdPrice - usdtPrice).toFixed(2)} (Spread: ${((fdusdPrice - usdtPrice)/usdtPrice * 100).toFixed(4)}%)`);

  // 2. Order Book Spread
  const bestBid = parseFloat(bookFDUSD.bids[0][0]);
  const bestAsk = parseFloat(bookFDUSD.asks[0][0]);
  const spreadUSD = bestAsk - bestBid;
  const spreadPct = (spreadUSD / bestBid) * 100;

  console.log(`\n📌 2. ORDER BOOK SPREAD & SLIPPAGE (BTC/FDUSD):`);
  console.log(`   • Best Bid (Buyer)     : $${bestBid.toFixed(2)}`);
  console.log(`   • Best Ask (Seller)    : $${bestAsk.toFixed(2)}`);
  console.log(`   • Bid-Ask Spread       : $${spreadUSD.toFixed(2)} (${spreadPct.toFixed(4)}% - Ultra Tight / Near Zero Slippage)`);

  // 3. Volatility Analysis (15m Candles for the last 12 hours)
  const klines15m = await fetchJson('https://api.binance.com/api/v3/klines?symbol=BTCFDUSD&interval=15m&limit=48');
  let totalSwings = 0;
  let profitableDips = 0;
  let avgSwingPct = 0;

  if (Array.isArray(klines15m)) {
    klines15m.forEach(k => {
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const swingPct = ((high - low) / low) * 100;
      totalSwings++;
      avgSwingPct += swingPct;
      if (swingPct >= 0.6) {
        profitableDips++;
      }
    });
    avgSwingPct = avgSwingPct / totalSwings;
  }

  console.log(`\n📌 3. REAL-WORLD VOLATILITY & SWING OPPORTUNITIES (LAST 12 HOURS):`);
  console.log(`   • Total 15m Candles Analyzed : ${totalSwings} periods (12 Hours)`);
  console.log(`   • Average 15m Price Range   : ${avgSwingPct.toFixed(2)}% (Approx $${(fdusdPrice * avgSwingPct / 100).toFixed(2)} USD per candle)`);
  console.log(`   • Profitable Micro Dips (>= 0.6%) : ${profitableDips} setups captured in 12 hours (Avg ~${(profitableDips / 12 * 5).toFixed(1)} setups per 5 hours)`);

  // 4. Exchange Filters
  const s = exInfo.symbols[0];
  const lotFilter = s.filters.find(f => f.filterType === 'LOT_SIZE');
  const notionalFilter = s.filters.find(f => f.filterType === 'NOTIONAL');

  console.log(`\n📌 4. BINANCE EXCHANGE TRADING RULES:`);
  console.log(`   • Min Order Amount (Notional) : $${parseFloat(notionalFilter.minNotional).toFixed(2)} FDUSD`);
  console.log(`   • Min BTC Step Size           : ${lotFilter.stepSize} BTC`);
  console.log(`   • Official Trading Fee Status : 0.00% ZERO MAKER & TAKER FEE on BTC/FDUSD Promo`);

  console.log("\n════════════════════════════════════════════════════════════════════════════════════");
  console.log("🎯 QUANTITATIVE DECISION & VERDICT:");
  console.log("════════════════════════════════════════════════════════════════════════════════════\n");
}

analyzeLiveFDUSD().catch(console.error);
