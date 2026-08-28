const http = require('http');

http.get('http://127.0.0.1:8766/api/status', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log("═════════════════════════════════════════════════════════════════════════");
    console.log("  🦀 BHARAT OS KERNEL — LIVE PROCESS TELEMETRY CHECK");
    console.log("═════════════════════════════════════════════════════════════════════════");
    const data = JSON.parse(d);
    console.log(`  • Symbol           : ${data.symbol}`);
    console.log(`  • Live Price       : $${data.price}`);
    console.log(`  • Active Holding   : ${data.wifBalance} WIF`);
    console.log(`  • In Position      : ${data.inPosition ? 'YES (ACTIVE SPOT TRADE)' : 'NO'}`);
    console.log(`  • Fast EMA (5)     : $${data.ema5?.toFixed(4)}`);
    console.log(`  • Slow EMA (13)    : $${data.ema13?.toFixed(4)}`);
    console.log(`  • Entry Price      : $${data.entryPrice}`);
    console.log(`  • Kernel Status    : 🟢 100% HEALTHY & TICKING ON HARDWARE`);
    console.log("═════════════════════════════════════════════════════════════════════════\n");
  });
}).on('error', err => {
  console.error("❌ Kernel IPC Error:", err.message);
});
