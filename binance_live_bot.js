const crypto = require('crypto');
const https = require('https');
const http = require('http');
const os = require('os');

// ── 🦀 BARE-METAL HARDWARE OPTIMIZATION & GOVERNOR LOCK ────────────────────────
try {
  os.setPriority(os.constants.priority.PRIORITY_HIGHEST);
  console.log("  ⚡ [HARDWARE] CPU Process Priority locked to REALTIME / HIGHEST");
} catch (e) {}

const fastAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 50,
  noDelay: true
});

require('./env_loader');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

if (!API_KEY || !SECRET_KEY) {
  console.error("❌ CRITICAL ERROR: BINANCE_API_KEY or BINANCE_SECRET_KEY missing in .env!");
  process.exit(1);
}

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function api(path, method, params = {}) {
  return new Promise((resolve, reject) => {
    params.timestamp = Date.now();
    params.recvWindow = 60000;
    const qs = Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const sig = sign(qs);
    const options = {
      hostname: 'api.binance.com', port: 443,
      path: `${path}?${qs}&signature=${sig}`,
      method, 
      agent: fastAgent,
      headers: { 'X-MBX-APIKEY': API_KEY }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}

function getPrice(sym) {
  return new Promise((r, j) => {
    https.get({
      hostname: 'api.binance.com',
      port: 443,
      path: `/api/v3/ticker/price?symbol=${sym}`,
      agent: fastAgent
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          r(parseFloat(JSON.parse(d).price));
        } catch(err) {
          j(err);
        }
      });
    }).on('error', j);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const SYMBOL = process.env.TRADING_SYMBOL || 'WIFUSDT';
let ENTRY_PRICE = 0.2176;
const STOP_LOSS_PCT = parseFloat(process.env.STOP_LOSS_PCT || '0.008');   // -0.8% micro shield
const TAKE_PROFIT_PCT = parseFloat(process.env.TAKE_PROFIT_PCT || '0.015'); // +1.5% Fast Cash Profit Lock!

let ema5 = ENTRY_PRICE;
let ema13 = ENTRY_PRICE;
let highestSeen = ENTRY_PRICE;
let liveWifQty = 20.83;
let inPosition = true;

async function getLiveWifBal() {
  const acc = await api('/api/v3/account', 'GET');
  const b = acc.balances?.find(b => b.asset === 'WIF');
  return b ? parseFloat(b.free) : 0;
}

async function kernelSmartTrader() {
  liveWifQty = await getLiveWifBal();
  inPosition = liveWifQty >= 1.0;

  console.log("═══════════════════════════════════════════════════════");
  console.log("  🦀 BHARAT OS KERNEL — HIGH-SPEED WIF/USDT TRADER ONLINE");
  console.log(`  Position State: ${inPosition ? `HOLDING ${liveWifQty.toFixed(2)} WIF` : 'USDT CASH (LOOKING FOR DIP ENTRY)'}`);
  console.log("  Target: +1.5% Fast Cash Lock | Stop-Loss: -0.8%");
  console.log("  1-Click Real Trade IPC Server Active on Port 8766");
  console.log("═══════════════════════════════════════════════════════\n");

  while (true) {
    try {
      const price = await getPrice(SYMBOL);

      ema5  = price * (2/(5+1))  + ema5  * (1 - 2/(5+1));
      ema13 = price * (2/(13+1)) + ema13 * (1 - 2/(13+1));
      if (price > highestSeen) highestSeen = price;

      if (inPosition) {
        const pnlPct = ((price - ENTRY_PRICE) / ENTRY_PRICE) * 100;
        const pnlINR = (price - ENTRY_PRICE) * liveWifQty * 83.5;
        process.stdout.write(
          `\r  🎩 [WIF SPEED TICK] WIF: $${price.toFixed(4)} | PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (${pnlINR >= 0 ? '+' : ''}₹${pnlINR.toFixed(2)}) | EMA5: $${ema5.toFixed(4)} | EMA13: $${ema13.toFixed(4)}   `
        );

        // 1. Take Profit (+2.5%)
        if (pnlPct >= TAKE_PROFIT_PCT * 100) {
          liveWifQty = await getLiveWifBal();
          const sellQty = Math.floor(liveWifQty * 100) / 100; // 2 decimal precision
          console.log(`\n\n  🎯 [TAKE-PROFIT +2.5% HIT!] Selling ${sellQty} WIF @ $${price.toFixed(4)}...`);
          const r = await api('/api/v3/order', 'POST', { symbol: SYMBOL, side: 'SELL', type: 'MARKET', quantity: sellQty.toFixed(2) });
          if (r.orderId) {
            console.log(`  🎉 REAL PROFIT BOOKED IN BINANCE SPOT WALLET! Order: ${r.orderId} | +₹${pnlINR.toFixed(2)} CASH PROFIT`);
            inPosition = false;
          }
          await sleep(3000);
          continue;
        }

        // 2. Strict 1% Stop-Loss
        if (pnlPct <= -(STOP_LOSS_PCT * 100)) {
          liveWifQty = await getLiveWifBal();
          const sellQty = Math.floor(liveWifQty * 100) / 100;
          console.log(`\n\n  🔴 [STRICT 1% STOP-LOSS CUT] Protecting Capital @ $${price.toFixed(4)} for ${sellQty} WIF...`);
          const r = await api('/api/v3/order', 'POST', { symbol: SYMBOL, side: 'SELL', type: 'MARKET', quantity: sellQty.toFixed(2) });
          if (r.orderId) {
            console.log(`  🛡️ CAPITAL PROTECTED! Order: ${r.orderId} | Max loss: ₹${pnlINR.toFixed(2)} (strictly capped)`);
            inPosition = false;
          }
          await sleep(15000);
          continue;
        }
      } else {
        process.stdout.write(
          `\r  ⏳ [WAITING FOR WIF DIP ENTRY] WIF: $${price.toFixed(4)} | EMA5: $${ema5.toFixed(4)} | EMA13: $${ema13.toFixed(4)} | Signal: ${ema5 > ema13 ? '🟢 BULLISH' : '🔴 WAIT'}   `
        );

        if (ema5 > ema13 * 1.0002) {
          const acc = await api('/api/v3/account', 'GET');
          const usdtBal = parseFloat(acc.balances?.find(b => b.asset === 'USDT')?.free || '0');
          const spend = Math.floor(usdtBal * 100) / 100;

          if (spend >= 1.0) {
            console.log(`\n\n  🚀 [KERNEL WIF DIP ENTRY] Buying WIF with $${spend.toFixed(2)} USDT @ $${price.toFixed(4)}...`);
            const r = await api('/api/v3/order', 'POST', {
              symbol: SYMBOL, side: 'BUY', type: 'MARKET',
              quoteOrderQty: spend.toFixed(2)
            });
            if (r.orderId) {
              console.log(`  ✅ WIF BUY FILLED! Order: #${r.orderId} | Entry: $${price.toFixed(4)} 🎯`);
              await sleep(1500);
              liveWifQty = await getLiveWifBal();
              inPosition = true;
              ENTRY_PRICE = price;
              highestSeen = price;
            }
          }
        }
      }
    } catch (e) {}

    await sleep(1000);
  }
}

// ── 🦀 LOCAL HTTP API SERVER FOR DASHBOARD 1-CLICK REAL TRADES ───────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/status' && req.method === 'GET') {
    try {
      const price = await getPrice(SYMBOL);
      const acc = await api('/api/v3/account', 'GET');
      const wifBal = parseFloat(acc.balances?.find(b => b.asset === 'WIF')?.free || '0');
      const usdtBal = parseFloat(acc.balances?.find(b => b.asset === 'USDT')?.free || '0');
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        symbol: SYMBOL,
        price,
        wifBalance: wifBal,
        usdtBalance: usdtBal,
        inPosition,
        ema5,
        ema13,
        entryPrice: ENTRY_PRICE
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === '/api/buy' && req.method === 'POST') {
    try {
      const acc = await api('/api/v3/account', 'GET');
      const usdtBal = parseFloat(acc.balances?.find(b => b.asset === 'USDT')?.free || '0');
      
      if (usdtBal < 1.0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Insufficient free USDT balance: $${usdtBal.toFixed(2)}` }));
        return;
      }

      console.log(`\n  🟢 [1-CLICK UI TRIGGER] Executing REAL SPOT BUY for WIF with $${usdtBal.toFixed(2)} USDT...`);
      const buyRes = await api('/api/v3/order', 'POST', {
        symbol: SYMBOL,
        side: 'BUY',
        type: 'MARKET',
        quoteOrderQty: usdtBal.toFixed(2)
      });

      inPosition = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, order: buyRes }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === '/api/sell' && req.method === 'POST') {
    try {
      const liveQty = await getLiveWifBal();
      const sellQty = Math.floor(liveQty * 100) / 100;

      if (sellQty < 0.01) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Insufficient WIF to sell: ${liveQty}` }));
        return;
      }

      console.log(`\n  🔴 [1-CLICK UI TRIGGER] Executing REAL SPOT SELL on Binance for ${sellQty} WIF...`);
      const sellRes = await api('/api/v3/order', 'POST', {
        symbol: SYMBOL,
        side: 'SELL',
        type: 'MARKET',
        quantity: sellQty.toFixed(2)
      });

      inPosition = false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, order: sellRes }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(8766, () => {
  console.log("  🌐 [IPC SERVER] Kernel Trade API listening on http://127.0.0.1:8766");
});

kernelSmartTrader();
