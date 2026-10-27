const https = require('https');
const net = require('net');
const crypto = require('crypto');
const os = require('os');
require('../env_loader');

async function runAudit() {
  console.log('═════════════════════════════════════════════════════════════════════════');
  console.log('  ⚡ BHARAT OS — GCP KERNEL SPEED & LATENCY COMPREHENSIVE AUDIT');
  console.log('═════════════════════════════════════════════════════════════════════════\n');

  // 1. Hardware Architecture
  const cpus = os.cpus();
  const totalMemGB = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
  const freeMemGB = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
  console.log('🖥️ [1/4] CLOUD HARDWARE & CPU PROFILE:');
  console.log(`   • Host Platform     : ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`   • CPU Model         : ${cpus[0].model}`);
  console.log(`   • Active Cores      : ${cpus.length} vCPUs`);
  console.log(`   • Memory Capacity   : ${totalMemGB} GB Total (Free: ${freeMemGB} GB)`);
  console.log(`   • Kernel Clock Res  : Nanosecond-precision (process.hrtime)\n`);

  // 2. Direct TCP Socket Latency
  console.log('📡 [2/4] DIRECT TCP SOCKET LATENCY TO BINANCE:');
  const tcpTargets = [
    { name: 'Binance REST API', host: 'api.binance.com', port: 443 },
    { name: 'Binance Stream WSS', host: 'stream.binance.com', port: 9443 }
  ];

  for (const target of tcpTargets) {
    const latencies = [];
    for (let i = 0; i < 4; i++) {
      const t0 = process.hrtime.bigint();
      await new Promise((resolve) => {
        const socket = net.connect(target.port, target.host, () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          latencies.push(ms);
          socket.destroy();
          resolve();
        });
        socket.on('error', () => resolve());
      });
    }
    const min = Math.min(...latencies).toFixed(2);
    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
    console.log(`   • ${target.name.padEnd(20)}: ${min} ms (Best) | ${avg} ms (Avg)`);
  }

  // 3. Keep-Alive HTTP Roundtrip
  console.log('\n🌐 [3/4] BINANCE API ROUND-TRIP TIME (RTT):');
  const agent = new https.Agent({ keepAlive: true, maxSockets: 10 });
  // Warmup connection
  await new Promise(r => https.get('https://api.binance.com/api/v3/ping', { agent }, res => { res.resume(); res.on('end', r); }).on('error', r));

  const httpTimes = [];
  for (let i = 0; i < 5; i++) {
    const t0 = process.hrtime.bigint();
    await new Promise(r => {
      https.get('https://api.binance.com/api/v3/ping', { agent }, res => {
        res.resume();
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          httpTimes.push(ms);
          r();
        });
      }).on('error', r);
    });
  }
  const minHttp = Math.min(...httpTimes).toFixed(2);
  const avgHttp = (httpTimes.reduce((a, b) => a + b, 0) / httpTimes.length).toFixed(2);
  const maxHttp = Math.max(...httpTimes).toFixed(2);
  console.log(`   • Raw HTTP Ping (Best)   : ${minHttp} ms`);
  console.log(`   • Raw HTTP Ping (Average): ${avgHttp} ms`);
  console.log(`   • Raw HTTP Ping (Max)    : ${maxHttp} ms`);

  // 4. In-Memory Decision & Cryptographic Speed
  console.log('\n⚡ [4/4] BARE-METAL ENGINE & CRYPTO SPEED:');
  
  // Math & Quant Logic Speed
  const tMath0 = process.hrtime.bigint();
  let dummy = 0.0;
  for (let i = 0; i < 5000000; i++) {
    dummy += (i * 0.001) / (1.0 + dummy * 0.0001);
  }
  const tMath1 = process.hrtime.bigint();
  const mathNsPerOp = (Number(tMath1 - tMath0) / 5000000).toFixed(2);
  console.log(`   • Quantitative Math Tick : ${mathNsPerOp} Nanoseconds / calculation`);

  // HMAC-SHA256 Signing Speed
  const secret = process.env.BINANCE_SECRET_KEY || 'sample_secret_key_12345';
  const payload = 'symbol=SOLUSDT&side=BUY&type=MARKET&quantity=0.05&timestamp=' + Date.now();
  const c0 = process.hrtime.bigint();
  const iterations = 100000;
  for (let i = 0; i < iterations; i++) {
    crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }
  const c1 = process.hrtime.bigint();
  const nsPerSign = Number(c1 - c0) / iterations;
  const signsPerSec = Math.round(1e9 / nsPerSign);
  console.log(`   • HMAC-SHA256 Signing    : ${nsPerSign.toFixed(2)} Nanoseconds (${(nsPerSign / 1000).toFixed(3)} µs)`);
  console.log(`   • Signing Throughput     : ${signsPerSec.toLocaleString()} orders / sec`);

  // Total Execution Latency Pipeline
  const totalExecutionReactionMs = (parseFloat(minHttp) + (nsPerSign / 1e6) + (parseFloat(mathNsPerOp) / 1e6)).toFixed(3);
  console.log('\n─────────────────────────────────────────────────────────────────────────');
  console.log(`  🏆 TOTAL END-TO-END TICK REACTION : ${totalExecutionReactionMs} ms`);
  console.log(`     (Hardware Math: ~${mathNsPerOp}ns | Signing: ~${nsPerSign.toFixed(0)}ns | Binance Net: ~${minHttp}ms)`);
  console.log('═════════════════════════════════════════════════════════════════════════\n');
}

runAudit().catch(console.error);
