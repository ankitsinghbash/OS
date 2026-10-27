const crypto = require('crypto');
const https = require('https');
require('../env_loader');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(q) {
  return crypto.createHmac('sha256', SECRET_KEY).update(q).digest('hex');
}

function api(path, method = 'GET', params = {}) {
  return new Promise((resolve, reject) => {
    params.timestamp = Date.now();
    params.recvWindow = 60000;
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const sig = sign(qs);
    const options = {
      hostname: 'api.binance.com',
      port: 443,
      path: `${path}?${qs}&signature=${sig}`,
      method,
      headers: { 'X-MBX-APIKEY': API_KEY }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getPrice(sym) {
  return new Promise((resolve) => {
    https.get(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(parseFloat(JSON.parse(d).price));
        } catch (e) {
          resolve(0.0);
        }
      });
    }).on('error', () => resolve(0.0));
  });
}

async function detailedAudit() {
  const [account, wifTrades, dogeTrades, wifPrice, dogePrice] = await Promise.all([
    api('/api/v3/account'),
    api('/api/v3/myTrades', 'GET', { symbol: 'WIFUSDT', limit: 1000 }),
    api('/api/v3/myTrades', 'GET', { symbol: 'DOGEUSDT', limit: 1000 }),
    getPrice('WIFUSDT'),
    getPrice('DOGEUSDT')
  ]);

  const allTrades = [
    ...(Array.isArray(wifTrades) ? wifTrades.map(t => ({ ...t, sym: 'WIF' })) : []),
    ...(Array.isArray(dogeTrades) ? dogeTrades.map(t => ({ ...t, sym: 'DOGE' })) : [])
  ].sort((a, b) => a.time - b.time);

  let winCount = 0;
  let lossCount = 0;
  let winAmountUSD = 0;
  let lossAmountUSD = 0;
  let totalFeesUSD = 0;
  let totalTurnoverUSD = 0;

  const cycleDetails = [];

  const symbols = ['DOGE', 'WIF'];
  for (const sym of symbols) {
    const symTrades = allTrades.filter(t => t.sym === sym);
    let inventory = [];

    for (const t of symTrades) {
      const isBuyer = t.isBuyer;
      const qty = parseFloat(t.qty);
      const price = parseFloat(t.price);
      const quoteQty = parseFloat(t.quoteQty);
      const fee = parseFloat(t.commission);
      let feeUSD = 0;
      if (t.commissionAsset === 'USDT') feeUSD = fee;
      else if (t.commissionAsset === sym) feeUSD = fee * price;
      else if (t.commissionAsset === 'BNB') feeUSD = fee * 650.0;
      totalFeesUSD += feeUSD;
      totalTurnoverUSD += quoteQty;

      if (isBuyer) {
        inventory.push({
          time: t.time,
          qty,
          price,
          feeUSD,
          remQty: qty
        });
      } else {
        let remSell = qty;
        let buyCost = 0;
        let buyFee = 0;
        let buyTimes = [];

        while (remSell > 1e-7 && inventory.length > 0) {
          const b = inventory[0];
          const m = Math.min(remSell, b.remQty);
          const f = m / b.qty;
          buyCost += m * b.price;
          buyFee += b.feeUSD * f;
          b.remQty -= m;
          remSell -= m;
          buyTimes.push(b.time);
          if (b.remQty < 1e-7) inventory.shift();
        }

        const sellVal = qty * price;
        const gross = sellVal - buyCost;
        const feeTotal = feeUSD + buyFee;
        const net = gross - feeTotal;

        if (net > 0) {
          winCount++;
          winAmountUSD += net;
        } else {
          lossCount++;
          lossAmountUSD += net;
        }

        cycleDetails.push({
          sym,
          buyTime: buyTimes[0] || t.time,
          sellTime: t.time,
          qty,
          buyPrice: buyCost / (qty || 1),
          sellPrice: price,
          gross,
          fee: feeTotal,
          net
        });
      }
    }
  }

  // Calculate current live portfolio
  const usdtBal = parseFloat(account.balances?.find(b => b.asset === 'USDT')?.free || '0');
  const wifBal = parseFloat(account.balances?.find(b => b.asset === 'WIF')?.free || '0');
  const dogeBal = parseFloat(account.balances?.find(b => b.asset === 'DOGE')?.free || '0');
  const totalUSD = usdtBal + (wifBal * wifPrice) + (dogeBal * dogePrice);

  // Latest open position
  const openWifVal = wifBal * wifPrice;
  const lastBuy = allTrades.filter(t => t.sym === 'WIF' && t.isBuyer).pop();
  const unrealizedWifPnL = lastBuy ? (wifPrice - parseFloat(lastBuy.price)) * wifBal : 0;

  console.log(JSON.stringify({
    wallet: {
      usdt: usdtBal,
      wif: wifBal,
      wifPrice,
      wifValUSD: openWifVal,
      doge: dogeBal,
      dogePrice,
      totalNetWorthUSD: totalUSD,
      totalNetWorthINR: totalUSD * 83.50,
      totalNetWorthP2P: totalUSD * 95.00
    },
    performance: {
      totalTradesCount: allTrades.length,
      totalCycles: cycleDetails.length,
      winCycles: winCount,
      lossCycles: lossCount,
      winRatePct: ((winCount / (cycleDetails.length || 1)) * 100).toFixed(1),
      totalProfitUSD: winAmountUSD,
      totalLossUSD: lossAmountUSD,
      netRealizedPnL_USD: winAmountUSD + lossAmountUSD,
      netRealizedPnL_INR: (winAmountUSD + lossAmountUSD) * 83.50,
      totalExchangeFeesUSD: totalFeesUSD,
      totalExchangeFeesINR: totalFeesUSD * 83.50,
      totalTurnoverUSD,
      totalTurnoverINR: totalTurnoverUSD * 83.50
    },
    activePosition: {
      symbol: 'WIFUSDT',
      qty: wifBal,
      entryPrice: lastBuy ? parseFloat(lastBuy.price) : 0,
      currentPrice: wifPrice,
      unrealizedPnL_USD: unrealizedWifPnL,
      unrealizedPnL_INR: unrealizedWifPnL * 83.50,
      unrealizedPnLPct: lastBuy ? (((wifPrice - parseFloat(lastBuy.price)) / parseFloat(lastBuy.price)) * 100).toFixed(2) : '0'
    },
    recentCycles: cycleDetails.slice(-10)
  }, null, 2));
}

detailedAudit().catch(console.error);
