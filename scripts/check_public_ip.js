const https = require('https');

https.get('https://api.ipify.org?format=json', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log("Your Current Public IP:", JSON.parse(d).ip));
});
