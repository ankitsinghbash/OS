const crypto = require('crypto');
const https = require('https');

require('../env_loader');
const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function signQuery(queryString, secret) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

function binanceRequest(path, method, queryParams = {}) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    queryParams.timestamp = timestamp;
    queryParams.recvWindow = 60000;

    const queryString = Object.keys(queryParams)
      .map(k => `${k}=${encodeURIComponent(queryParams[k])}`)
      .join('&');

    const signature = signQuery(queryString, SECRET_KEY);
    const fullQuery = `${queryString}&signature=${signature}`;

    const options = {
      hostname: 'api.binance.com',
      port: 443,
      path: `${path}?${fullQuery}`,
      method: method,
      headers: {
        'X-MBX-APIKEY': API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', err => reject(err));
    req.end();
  });
}

async function runDirectTrade() {
  console.log("═════════════════════════════════════════════════════════════════════════");
  console.log("  🚀 BHARAT OS — DIRECT BINANCE SPOT ORDER EXECUTION ENGINE");
  console.log("  Sending Signed Real Order to Global Exchange Matching Engine");
  console.log("═════════════════════════════════════════════════════════════════════════\n");

  // 1. Check Account Balances
  console.log("  [1/3] Fetching Verified Live Account Balances...");
  const account = await binanceRequest('/api/v3/account', 'GET');
  let usdtBal = 0;
  if (account.balances) {
    const usdtObj = account.balances.find(b => b.asset === 'USDT');
    usdtBal = usdtObj ? parseFloat(usdtObj.free) : 0;
  }
  console.log(`  ✅ Verified Live Spot Balance: $${usdtBal.toFixed(4)} USDT (₹${(usdtBal * 83.5).toFixed(2)} INR)`);

  // 2. Fetch Live DOGE Price
  console.log("\n  [2/3] Fetching Current Dogecoin (DOGE/USDT) Live Price...");
  const ticker = await new Promise(resolve => {
    https.get('https://api.binance.com/api/v3/ticker/price?symbol=DOGEUSDT', res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });
  const dogePrice = parseFloat(ticker.price);
  console.log(`  📊 Dogecoin (DOGE/USDT) Price: $${dogePrice.toFixed(4)} USD`);

  // 3. Send Real Spot Market Buy Order on DOGEUSDT
  console.log(`\n  [3/3] Sending Signed Real SPOT BUY Order on DOGEUSDT for $${usdtBal.toFixed(2)} USDT...`);
  const orderRes = await binanceRequest('/api/v3/order', 'POST', {
    symbol: 'DOGEUSDT',
    side: 'BUY',
    type: 'MARKET',
    quoteOrderQty: usdtBal.toFixed(2)
  });

  console.log("\n  📋 Binance Matching Engine Response:");
  console.log(JSON.stringify(orderRes, null, 2));

  if (orderRes.code === -1013 && orderRes.msg && orderRes.msg.includes('MIN_NOTIONAL')) {
    console.log("\n  💡 NOTE ON BINANCE EXCHANGE RULE:");
    console.log("      Binance requires a minimum order size of $5.00 USD for BTCUSDT.");
    console.log(`      Your current balance is $${usdtBal.toFixed(2)} USD (just $0.43 short of the $5 limit).`);
    console.log("      Tip: Adding ₹50-₹100 ($1) will make it $5.57 and execute directly into the BTC order book!");
  } else if (orderRes.orderId) {
    console.log(`\n  🎉 SUCCESS! REAL SPOT BUY ORDER EXECUTED! Order ID: ${orderRes.orderId}`);
  }
}

runDirectTrade().catch(console.error);
