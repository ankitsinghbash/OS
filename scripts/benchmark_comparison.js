const https = require('https');

async function measureHttpLatency() {
  const trials = 5;
  const results = [];

  for (let i = 0; i < trials; i++) {
    const t0 = Date.now();
    await new Promise(resolve => {
      https.get('https://api.binance.com/api/v3/ping', res => {
        res.on('data', () => {});
        res.on('end', () => {
          results.push(Date.now() - t0);
          resolve();
        });
      }).on('error', resolve);
    });
  }

  const min = Math.min(...results);
  const avg = (results.reduce((a, b) => a + b, 0) / results.length).toFixed(1);
  const max = Math.max(...results);
  return { min, avg, max, results };
}

function measureComputeSpeed() {
  const t0 = process.hrtime.bigint();
  let x = 0.0;
  for (let i = 0; i < 10000000; i++) {
    x += (i * 0.0001) / (1.0 + x * 0.000001);
  }
  const t1 = process.hrtime.bigint();
  const ns = Number(t1 - t0);
  return { ms: (ns / 1000000).toFixed(2), nsPerOp: (ns / 10000000).toFixed(2) };
}

function measureMemoryAllocation() {
  const t0 = process.hrtime.bigint();
  const arr = [];
  for (let i = 0; i < 500000; i++) {
    arr.push({ id: i, symbol: 'WIFUSDT', price: 0.2018, qty: 19.41 });
  }
  const t1 = process.hrtime.bigint();
  const ms = (Number(t1 - t0) / 1000000).toFixed(2);
  return { ms, count: arr.length };
}

async function run() {
  console.log("═════════════════════════════════════════════════════════════════════════");
  console.log(`  ⚡ BHARAT OS — PERFORMANCE BENCHMARK SUITE [${process.platform.toUpperCase()}]`);
  console.log("═════════════════════════════════════════════════════════════════════════\n");

  const net = await measureHttpLatency();
  console.log(`  📡 [TEST CASE 1: NETWORK LATENCY TO BINANCE]`);
  console.log(`     • Min Round-Trip : ${net.min} ms`);
  console.log(`     • Avg Round-Trip : ${net.avg} ms`);
  console.log(`     • Max Round-Trip : ${net.max} ms`);

  const cpu = measureComputeSpeed();
  console.log(`\n  ⚙️ [TEST CASE 2: CPU TICK & QUANT DECISION ENGINE]`);
  console.log(`     • 10M Operations : ${cpu.ms} ms`);
  console.log(`     • Per-Tick Speed : ${cpu.nsPerOp} nanoseconds per tick`);

  const mem = measureMemoryAllocation();
  console.log(`\n  🧠 [TEST CASE 3: MEMORY ALLOCATION & OBJECT POOLING]`);
  console.log(`     • 500,000 Structs: ${mem.ms} ms`);
  console.log("═════════════════════════════════════════════════════════════════════════\n");
}

run();
