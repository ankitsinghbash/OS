const https = require('https');

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.binance.com${path}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function calcEMA(arr, period) {
  const k = 2 / (period + 1);
  let val = arr[0];
  for (let i = 1; i < arr.length; i++) {
    val = (arr[i] * k) + (val * (1 - k));
  }
  return val;
}

function calcRSI(arr, period = 14) {
  if (arr.length <= period) return 50.0;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = arr[i] - arr[i - 1];
    if (diff >= 0) gains += diff; else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < arr.length; i++) {
    const diff = arr[i] - arr[i - 1];
    avgGain = (avgGain * (period - 1) + (diff >= 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }
  if (avgLoss === 0) return 100.0;
  return 100.0 - (100.0 / (1.0 + (avgGain / avgLoss)));
}

async function inspectCoins() {
  const symbols = ['SOLUSDT', 'DOGEUSDT', 'WIFUSDT'];
  console.log('═════════════════════════════════════════════════════════════════════════');
  console.log('  🎯 BHARAT OS — LIVE TRIGGER & TIMING AUDIT (How close to entry?)');
  console.log('═════════════════════════════════════════════════════════════════════════\n');

  for (const sym of symbols) {
    const [k1h, k15m, ticker] = await Promise.all([
      get(`/api/v3/klines?symbol=${sym}&interval=1h&limit=55`),
      get(`/api/v3/klines?symbol=${sym}&interval=15m&limit=30`),
      get(`/api/v3/ticker/price?symbol=${sym}`)
    ]);

    const closes1h = k1h.map(k => parseFloat(k[4]));
    const closes15m = k15m.map(k => parseFloat(k[4]));
    const price = parseFloat(ticker.price);

    const ema20 = calcEMA(closes1h, 20);
    const ema50 = calcEMA(closes1h, 50);
    const rsi15m = calcRSI(closes15m, 14);

    const is1hBullish = ema20 > ema50;
    const isDipReady = rsi15m <= 48.0;

    console.log(`📌 Pair: ${sym} (Live Price: $${price})`);
    console.log(`   • 1H Trend (EMA 20 vs 50): $${ema20.toFixed(4)} vs $${ema50.toFixed(4)} ➔ ${is1hBullish ? '🟢 BULLISH (Ready!)' : '🔴 DOWNTREND (Gap: ' + ((ema50-ema20)/ema50*100).toFixed(2) + '%)'}`);
    console.log(`   • 15m RSI                : ${rsi15m.toFixed(1)} ➔ ${isDipReady ? '🟢 DIP READY (Under 48)' : '⏳ WAITING PULLBACK (> 48)'}`);
    
    if (is1hBullish && isDipReady) {
      console.log(`   🔥 STATUS: 🚀 READY TO FIRE IMMEDIATELY!`);
    } else if (is1hBullish && !isDipReady) {
      console.log(`   ⏳ STATUS: 1H Trend is Bullish! Waiting for 1 small 15m red candle to dip under RSI 48.`);
    } else {
      console.log(`   ⏳ STATUS: Waiting for 1H price bounce above $${ema50.toFixed(2)} to confirm uptrend.`);
    }
    console.log('─────────────────────────────────────────────────────────────────────────');
  }
}

inspectCoins().catch(console.error);
