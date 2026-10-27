const crypto = require('crypto');
const https = require('https');

const API_KEY = "Zc1MmRVSCTWsCT5RMCdCAVYRZTDlQLFtC4ToRGcikjZeiDRZ0DxoWi6vbigE8lju";
const SECRET_KEY = "ZLhVTaaZpaHHEudAzYKdbNM2ivkYBkByhhi3Bh95mhIR1Mv0madBoNscKonMsaMp";

const ts = Date.now();
const qs = `timestamp=${ts}&recvWindow=60000`;
const sig = crypto.createHmac('sha256', SECRET_KEY).update(qs).digest('hex');

const options = {
  hostname: 'api.binance.com',
  path: `/api/v3/account?${qs}&signature=${sig}`,
  method: 'GET',
  headers: { 'X-MBX-APIKEY': API_KEY }
};

const req = https.request(options, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log("Status Code:", res.statusCode);
    console.log("Response Body:", d);
  });
});
req.on('error', console.error);
req.end();
