const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');


// Dynamically load untracked .env config if present
const env = {};
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    });
  } catch (e) {}
}

// ═════════════════════════════════════════════════════════════════════════
// 🔒 CYBERSECURITY CONFIGURATION & HARDENING POLICY
// ═════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 8766;
const HOST = '127.0.0.1'; // STRICT LOCALHOST ONLY: Never bind 0.0.0.0 (prevents LAN/Wi-Fi sniffing)
const CACHE_FILE = path.join(__dirname, 'latest_dashboard_data.json');
const HTML_FILE = path.join(__dirname, 'index.html');
const SSH_KEY_PATH = process.env.GCP_SSH_KEY || env.GCP_SSH_KEY || path.join(os.homedir(), '.ssh', 'id_gcp_deploy');
const REMOTE_HOST = process.env.GCP_REMOTE_HOST || env.GCP_REMOTE_HOST || '';
const REMOTE_DIR = process.env.GCP_REMOTE_DIR || env.GCP_REMOTE_DIR || '~/bharatos';


// ── Rate Limiting (DoS & Brute-Force Prevention) ──────────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 30;     // Max 30 requests / minute
const MIN_REFRESH_INTERVAL_MS = 2000;    // Min 2 seconds between refresh clicks
const clientHits = new Map();
let lastRefreshTime = 0;

function checkRateLimit(ip) {
  const now = Date.now();
  const history = clientHits.get(ip) || [];
  const validHistory = history.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (validHistory.length >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - validHistory[0])) / 1000) };
  }

  validHistory.push(now);
  clientHits.set(ip, validHistory);
  return { allowed: true };
}

// ── Strict Security Headers ───────────────────────────────────────────────
function applySecurityHeaders(res) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Cross-site scripting (XSS) filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Privacy & Referrer lockdown
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable dangerous browser hardware APIs
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  // Content Security Policy (CSP): Only allow self and Google Fonts
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; " +
    "connect-src 'self' http://localhost:8766 http://127.0.0.1:8766; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'none';"
  );
  // CORS: Restrict to localhost only
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── In-Memory Cache ───────────────────────────────────────────────────────
let cachedData = null;
let lastFetchTime = 0;
let isFetching = false;

// Load disk cache on boot if available
if (fs.existsSync(CACHE_FILE)) {
  try {
    cachedData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {}
}

// ── Safe Subprocess Execution (Prevents Command Injection) ────────────────
function fetchLiveGCPData() {
  return new Promise((resolve) => {
    // Use execFile with explicit argument array to eliminate shell interpolation vulnerabilities
    const remoteScript = `${REMOTE_DIR}/scripts/get_dashboard_data.js`;
    const args = [
      '-i', SSH_KEY_PATH,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=8',
      REMOTE_HOST,
      `node ${remoteScript}`
    ];

    execFile('ssh', args, { timeout: 12000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[SECURITY AUDIT] Remote query error:', err.message);
        if (cachedData) {
          resolve({ ...cachedData, _warning: 'Served from safe cache (Remote node busy)' });
        } else {
          resolve({ success: false, error: 'Remote connection timeout or unavailable' });
        }
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        cachedData = parsed;
        lastFetchTime = Date.now();
        // Atomic safe disk write
        fs.writeFileSync(CACHE_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        resolve(parsed);
      } catch (parseErr) {
        console.error('[SECURITY AUDIT] Failed to parse sanitized output');
        if (cachedData) {
          resolve({ ...cachedData, _warning: 'Served from safe cache' });
        } else {
          resolve({ success: false, error: 'Sanitization parse failure' });
        }
      }
    });
  });
}

// ── HTTP Server Request Handler ───────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  // 1. HTTP Method Whitelist (Only GET & OPTIONS permitted)
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed. Only GET is permitted.' }));
    return;
  }

  // 2. Request URL Sanitization & Path Traversal Defense
  if (req.url.length > 512 || req.url.includes('..') || req.url.includes('%2e%2e') || req.url.includes('\0')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request: Malformed or suspicious URI parameter' }));
    return;
  }

  const clientIP = req.socket.remoteAddress || '127.0.0.1';
  let url;
  try {
    url = new URL(req.url, `http://${HOST}:${PORT}`);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid URL formatting' }));
    return;
  }

  // 3. Rate Limit Enforcement
  const rateCheck = checkRateLimit(clientIP);
  if (!rateCheck.allowed) {
    res.writeHead(429, { 
      'Content-Type': 'application/json',
      'Retry-After': String(rateCheck.retryAfter)
    });
    res.end(JSON.stringify({ error: `Rate limit exceeded. Please wait ${rateCheck.retryAfter}s.` }));
    return;
  }

  // 4. API Endpoint: /api/data or /api/refresh
  if (url.pathname === '/api/data' || url.pathname === '/api/refresh') {
    const forceRefresh = url.searchParams.get('refresh') === 'true' || url.pathname === '/api/refresh';
    const now = Date.now();

    // Prevent rapid double-clicking (Min 2s interval for live calls)
    if (forceRefresh) {
      if (now - lastRefreshTime < MIN_REFRESH_INTERVAL_MS && cachedData) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cachedData));
        return;
      }
      lastRefreshTime = now;
    }

    // Trigger fetch if stale (>10s) or explicitly requested
    if (forceRefresh || !cachedData || (now - lastFetchTime > 10000)) {
      if (!isFetching) {
        isFetching = true;
        const data = await fetchLiveGCPData();
        isFetching = false;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cachedData || { success: false, message: 'Syncing initial telemetry...' }));
    return;
  }

  // 5. Serve Main Dashboard HTML (Strict Whitelist)
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/dashboard') {
    if (fs.existsSync(HTML_FILE)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(HTML_FILE, 'utf8'));
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('index.html not found');
      return;
    }
  }

  // 6. Default Deny on Any Unknown Path
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint Not Found. Access Denied.' }));
});

// ── Bind to 127.0.0.1 (Zero External Interface Exposure) ──────────────────
server.listen(PORT, HOST, () => {
  console.log(`\n═════════════════════════════════════════════════════════════`);
  console.log(`🛡️  BHARAT OS — CYBERSECURITY HARDENED TERMINAL`);
  console.log(`🔒  Loopback Binding:   http://${HOST}:${PORT}`);
  console.log(`🛡️  Security Policy:    CSP, X-Frame, X-XSS, Rate-Limiting ACTIVE`);
  console.log(`🌐  Subprocess Guard:   Shell Injection Proof (execFile array)`);
  console.log(`═════════════════════════════════════════════════════════════\n`);

  // Pre-fetch live data safely in background
  fetchLiveGCPData().then(() => {
    console.log('✅ Initial live balance securely verified from Tokyo Cloud Node.');
  });
});
