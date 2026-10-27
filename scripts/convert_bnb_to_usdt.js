const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const env = {};
fs.readFileSync('/home/ankitsingh4734414/bharatos/.env', 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=');
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const KEY = env.BINANCE_API_KEY;
const SECRET = env.BINANCE_SECRET_KEY;

function sign(params) {
  const qs = Object.entries({ ...params, timestamp: Date.now(), recvWindow: 10000 })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const signature = crypto.createHmac('sha256', SECRET).update(qs).digest('hex');
  return `${qs}&signature=${signature}`;
}

function req(endpoint, body = '') {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'BharatOS/1.0',
      'X-MBX-APIKEY': KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    };
    const r = https.request({ hostname: 'api.binance.com', path: endpoint, method: 'POST', headers }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve(d); }
      });
    });
    r.on('error', err => resolve({ error: err.message }));
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  console.log('1. Trying to convert BNB to USDT via Binance Convert...');
  const quote = await req('/sapi/v1/convert/getQuote', sign({
    fromAsset: 'BNB',
    toAsset: 'USDT',
    fromAmount: '0.000363'
  }));
  console.log('Convert quote:', JSON.stringify(quote));

  if (quote && quote.quoteId) {
    const accept = await req('/sapi/v1/convert/acceptQuote', sign({ quoteId: quote.quoteId }));
    console.log('Accepted quote:', JSON.stringify(accept));

    // Then transfer to funding
    const xfer = await req('/sapi/v1/asset/transfer', sign({
      type: 'MAIN_FUNDING',
      asset: 'USDT',
      amount: quote.toAmount
    }));
    console.log('Transferred converted USDT to Funding:', JSON.stringify(xfer));
  } else {
    // If convert min limit applies, transfer BNB directly to Funding
    console.log('2. Transferring BNB directly to Funding Wallet...');
    const xferBnb = await req('/sapi/v1/asset/transfer', sign({
      type: 'MAIN_FUNDING',
      asset: 'BNB',
      amount: '0.000363'
    }));
    console.log('Transferred BNB to Funding:', JSON.stringify(xferBnb));
  }
}

main().catch(console.error);
