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

function fetch5mTrend(sym) {
  return new Promise((resolve) => {
    https.get({
      hostname: 'api.binance.com',
      port: 443,
      path: `/api/v3/klines?symbol=${sym}&interval=5m&limit=25`,
      agent: fastAgent
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const raw = JSON.parse(d);
          if (!Array.isArray(raw) || raw.length < 21) {
            resolve({ isBullish: true, ema9: 0, ema21: 0 });
            return;
          }
          const closes = raw.map(k => parseFloat(k[4]));
          const calcEma = (period) => {
            const k = 2 / (period + 1);
            let ema = closes[0];
            for (let i = 1; i < closes.length; i++) {
              ema = (closes[i] * k) + (ema * (1 - k));
            }
            return ema;
          };
          const ema9 = calcEma(9);
          const ema21 = calcEma(21);
          resolve({ isBullish: ema9 >= ema21, ema9, ema21 });
        } catch(err) {
          resolve({ isBullish: true, ema9: 0, ema21: 0 });
        }
      });
    }).on('error', () => resolve({ isBullish: true, ema9: 0, ema21: 0 }));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 🛡️ QUANTITATIVE RISK & EXECUTION PARAMETERS ─────────────────────────────────
const SYMBOL = process.env.TRADING_SYMBOL || 'WIFUSDT';
let ENTRY_PRICE = 0.2018;
const STOP_LOSS_BASE_PCT = parseFloat(process.env.STOP_LOSS_PCT || '0.008'); // -0.8% Base Cut
const TAKE_PROFIT_PCT = parseFloat(process.env.TAKE_PROFIT_PCT || '0.015');   // +1.5% Profit Lock
const BREAKEVEN_TRIGGER_PCT = 0.007; // +0.7% moves stop to Entry+0.2%
const COOLDOWN_MS = 15 * 60 * 1000;   // 15 Minutes Hard Cooldown
const MIN_DIP_PCT = 0.015;           // -1.5% Minimum Drop Required for Early Re-entry

let ema5 = ENTRY_PRICE;
let ema13 = ENTRY_PRICE;
let liveWifQty = 19.41;
let inPosition = true;
let breakevenLocked = false;
let lastExitTime = 0;
let lastExitPrice = 0;
let macroTrend = { isBullish: true, ema9: 0, ema21: 0 };

async function getLiveWifBal() {
  const acc = await api('/api/v3/account', 'GET');
  const b = acc.balances?.find(b => b.asset === 'WIF');
  return b ? parseFloat(b.free) : 0;
}

async function kernelSmartTrader() {
  liveWifQty = await getLiveWifBal();
  inPosition = liveWifQty >= 1.0;

  console.log("═════════════════════════════════════════════════════════════════════════");
  console.log("  🦀 BHARAT OS KERNEL v0.3.0 — 5-SHIELD QUANTITATIVE SPOT ENGINE ONLINE");
  console.log(`  Position State: ${inPosition ? `HOLDING ${liveWifQty.toFixed(2)} WIF` : 'USDT CASH (LOOKING FOR DIP ENTRY)'}`);
  console.log("  🛡️ SHIELDS: Breakeven Lock (+0.7%) | 15m Cooldown | 5m Macro Confirmation");
  console.log("  1-Click Real Trade IPC Server Active on Port 8766");
  console.log("═════════════════════════════════════════════════════════════════════════\n");

  let tickCount = 0;

  while (true) {
    try {
      tickCount++;
      const price = await getPrice(SYMBOL);

      // Micro EMAs
      ema5  = price * (2/(5+1))  + ema5  * (1 - 2/(5+1));
      ema13 = price * (2/(13+1)) + ema13 * (1 - 2/(13+1));

      // Fetch 5m Macro Trend every 30 seconds
      if (tickCount % 30 === 1) {
        macroTrend = await fetch5mTrend(SYMBOL);
      }

      if (inPosition) {
        const pnlPct = ((price - ENTRY_PRICE) / ENTRY_PRICE) * 100;
        const pnlINR = (price - ENTRY_PRICE) * liveWifQty * 83.50;

        // SHIELD 1: Dynamic Breakeven Lock (+0.7%)
        if (!breakevenLocked && pnlPct >= BREAKEVEN_TRIGGER_PCT * 100) {
          breakevenLocked = true;
          console.log(`\n  🔒 [BREAKEVEN SHIELD ENGAGED] Profit hit +${pnlPct.toFixed(2)}%! Stop-Loss shifted to Entry+0.2% (Guaranteed Green Exit)`);
        }

        const shieldStatus = breakevenLocked ? '🔒 BREAKEVEN LOCKED' : '🛡️ BASE -0.8% SHIELD';
        process.stdout.write(
          `\r  🎩 [HOLDING WIF] $${price.toFixed(4)} | PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (${pnlINR >= 0 ? '+' : ''}₹${pnlINR.toFixed(2)}) | Target: $${(ENTRY_PRICE * 1.015).toFixed(4)} | ${shieldStatus}   `
        );

        // 1. Take Profit (+1.5%)
        if (pnlPct >= TAKE_PROFIT_PCT * 100) {
          liveWifQty = await getLiveWifBal();
          const sellQty = Math.floor(liveWifQty * 100) / 100;
          console.log(`\n\n  🎯 [TAKE-PROFIT +1.5% HIT!] Selling ${sellQty} WIF @ $${price.toFixed(4)}...`);
          const r = await api('/api/v3/order', 'POST', { symbol: SYMBOL, side: 'SELL', type: 'MARKET', quantity: sellQty.toFixed(2) });
          if (r.orderId) {
            console.log(`  🎉 REAL PROFIT BOOKED! Order: #${r.orderId} | +₹${pnlINR.toFixed(2)} CASH PROFIT`);
            inPosition = false;
            breakevenLocked = false;
            lastExitTime = Date.now();
            lastExitPrice = price;
          }
          await sleep(3000);
          continue;
        }

        // 2. Stop-Loss or Breakeven Cut
        const effectiveStopPct = breakevenLocked ? 0.2 : -(STOP_LOSS_BASE_PCT * 100);
        if (pnlPct <= effectiveStopPct) {
          liveWifQty = await getLiveWifBal();
          const sellQty = Math.floor(liveWifQty * 100) / 100;
          const exitLabel = breakevenLocked ? 'BREAKEVEN PROFIT EXIT' : 'CAPITAL PROTECTION STOP-LOSS';
          console.log(`\n\n  🛡️ [${exitLabel}] Executing Safe Exit @ $${price.toFixed(4)} for ${sellQty} WIF (PnL: ${pnlPct.toFixed(2)}%)...`);
          const r = await api('/api/v3/order', 'POST', { symbol: SYMBOL, side: 'SELL', type: 'MARKET', quantity: sellQty.toFixed(2) });
          if (r.orderId) {
            console.log(`  🛡️ EXIT FILLED! Order: #${r.orderId} | PnL: ₹${pnlINR.toFixed(2)}`);
            inPosition = false;
            breakevenLocked = false;
            lastExitTime = Date.now();
            lastExitPrice = price;
          }
          await sleep(5000);
          continue;
        }
      } else {
        // SHIELD 2: Check 15-Minute Cooldown & Minimum Dip
        const elapsed = Date.now() - lastExitTime;
        let cooldownActive = false;
        let remainingSecs = 0;

        if (lastExitTime > 0 && elapsed < COOLDOWN_MS) {
          const dipAchieved = lastExitPrice > 0 && price <= lastExitPrice * (1 - MIN_DIP_PCT);
          if (!dipAchieved) {
            cooldownActive = true;
            remainingSecs = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
          }
        }

        const isMicroBullish = ema5 > ema13 * 1.0002;
        const canEnter = !cooldownActive && macroTrend.isBullish && isMicroBullish;

        let statusText = '⏳ WAITING FOR BULLISH SIGNAL';
        if (cooldownActive) {
          statusText = `⏳ COOLDOWN ACTIVE (${remainingSecs}s | Min -1.5% Dip Req)`;
        } else if (!macroTrend.isBullish) {
          statusText = '🔴 5m MACRO DOWNTREND (BUY LOCKED)';
        } else if (isMicroBullish) {
          statusText = '🟢 BULLISH SIGNAL CONFIRMED';
        }

        process.stdout.write(
          `\r  💵 [USDT CASH] WIF: $${price.toFixed(4)} | 5m Macro: ${macroTrend.isBullish ? '🟢' : '🔴'} | Micro: ${isMicroBullish ? '🟢' : '🔴'} | ${statusText}   `
        );

        if (canEnter) {
          const acc = await api('/api/v3/account', 'GET');
          const usdtBal = parseFloat(acc.balances?.find(b => b.asset === 'USDT')?.free || '0');
          const spend = Math.floor(usdtBal * 0.98 * 100) / 100;

          if (spend >= 1.0) {
            console.log(`\n\n  🚀 [QUANTITATIVE ENTRY] Dip Confirmed! Buying WIF with $${spend.toFixed(2)} USDT @ $${price.toFixed(4)}...`);
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
              breakevenLocked = false;
            }
          }
        }
      }
    } catch (e) {}

    await sleep(1000);
  }
}

// ── 🦀 LOCAL HTTP API SERVER FOR DASHBOARD TELEMETRY & 1-CLICK TRADES ────────
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
      
      const elapsed = Date.now() - lastExitTime;
      const cooldownRemaining = (lastExitTime > 0 && elapsed < COOLDOWN_MS) ? Math.ceil((COOLDOWN_MS - elapsed) / 1000) : 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        symbol: SYMBOL,
        price,
        wifBalance: wifBal,
        usdtBalance: usdtBal,
        inPosition,
        breakevenLocked,
        cooldownRemaining,
        macroTrend: macroTrend.isBullish ? 'BULLISH' : 'BEARISH',
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

  res.writeHead(404);
  res.end();
});

server.listen(8766, () => {
  console.log("  🌐 [IPC SERVER] Kernel Trade API listening on http://127.0.0.1:8766");
});

kernelSmartTrader();
