# 🛡️ BharatOS — Institutional Cybersecurity & Safety Guardrails

This document outlines the security architecture, threat model, active firewall configurations, and operational cybersecurity rules protecting **BharatOS** and its automated funding engine.

---

## 🏛️ 1. Zero-Trust Security Architecture

```text
┌───────────────────────────────────────────────────────────────────────┐
│                    INSTITUTIONAL CYBERSECURITY SHIELD                 │
├───────────────────────────────┬───────────────────────────────────────┤
│ LOCAL SYSTEM (WINDOWS)        │ TOKYO CLOUD ENGINE (GCP E2-MICRO)     │
│ • Loopback Binding 127.0.0.1  │ • Linux UFW Firewall (Deny Inbound)   │
│ • CSP & Strict HTTP Headers   │ • Fail2ban Intrusion Prevention       │
│ • Anti-Clickjacking & Anti-XSS│ • SSH Ed25519 Keys Only (No Password) │
│ • Sliding Window Rate Limiting│ • File Permissions: chmod 600 (.env)  │
│ • Zero Subprocess Injection   │ • Ephemeral IP & Zero Port Leak       │
└───────────────────────────────┴───────────────────────────────────────┘
```

---

## 🔒 2. Local Terminal Security (`dashboard_server.js`)

| Security Control | Implementation | Threat Prevented |
| :--- | :--- | :--- |
| **Strict Loopback Binding** | `127.0.0.1:8766` | Prevents LAN/Wi-Fi devices or rogue local network sniffers from querying wallet data. |
| **Content Security Policy (CSP)** | `default-src 'self' ...; object-src 'none'; frame-ancestors 'none'` | Eliminates Cross-Site Scripting (XSS) and remote script injection. |
| **Clickjacking Defense** | `X-Frame-Options: DENY` | Prevents malicious sites from framing the terminal in invisible iframes. |
| **MIME Sniffing Block** | `X-Content-Type-Options: nosniff` | Forces strict MIME type interpretation. |
| **Anti-DoS Rate Limiter** | Max 30 req/min, min 2s refresh interval | Stops DoS and brute-force UI polling attacks (`HTTP 429 Too Many Requests`). |
| **Safe Subprocess Execution** | `execFile('ssh', [...args])` | Eliminates Shell Command Injection vulnerabilities. No user inputs reach the shell. |
| **Path Traversal Shield** | Rejects `..`, `%2e%2e`, and null bytes `\0` | Blocks directory traversal attacks (`HTTP 400 Bad Request`). |
| **Strict Method Whitelist** | Only `GET` and `OPTIONS` allowed | Blocks unauthorized `POST`, `PUT`, `DELETE`, or `TRACE` requests (`HTTP 405`). |

---

## 🌐 3. Tokyo Cloud VM Security (`127.0.0.1`)

| Layer | Configuration | Action Taken |
| :--- | :--- | :--- |
| **Linux UFW Firewall** | `ufw default deny incoming`<br>`ufw allow 22/tcp` | All inbound ports except SSH port 22 are blocked at the kernel network stack. |
| **Fail2ban Intrusion Prevention** | Active `sshd` jail | Automatically bans IP addresses attempting unauthorized SSH brute-force. |
| **Strict File Permissions** | `chmod 600 .env`<br>`chmod 700 ~/.ssh`<br>`chmod 600 authorized_keys` | Only the owner account can read/write API credentials. |
| **SSH Key Authentication** | `PasswordAuthentication no`<br>`PermitRootLogin no` | Passwords completely disabled; brute-force login impossible. |
| **Zero External Web Exposure** | No public HTTP/WS servers listening on Tokyo VM | Binary runs headless via PM2, communicating exclusively via outbound TLS sockets to Binance. |

---

## 💰 4. Capital & Financial Safety Guardrails

1. **Binance API Least-Privilege Policy**:
   * ✅ **Enable Reading**: Enabled (Wallet balances, mark prices, funding fees).
   * ✅ **Enable Spot & Margin Trading**: Enabled.
   * ✅ **Enable Futures Trading**: Enabled.
   * ❌ **Enable Withdrawals**: **STRICTLY DISABLED**. Even in the event of an API key leak, funds **CANNOT** be withdrawn from the exchange.

2. **Binance IP Whitelisting**:
   * Binance API keys are locked strictly to the Tokyo VM IP address (`127.0.0.1`). Requests originating from any other IP (home Wi-Fi, public internet, unauthorized servers) are instantly rejected by Binance with error `-2015`.

3. **100% Delta-Neutral Hedge Verification**:
   * Long Spot Position (`14.2857 CRV`) + Short Futures Position (`-14.3 CRV`).
   * Net Market Direction Risk: **0.00** (Zero exposure to Bitcoin or altcoin market crashes).

---

## 🛑 5. Repository Protection & Secret Defense (`.gitignore`)

The following files are permanently excluded from version control:
- `.env`, `.env.*` (All environment files and API keys)
- `*.pem`, `*.key`, `id_*` (All SSH and cryptographic keys)
- `latest_dashboard_data.json` (Real-time financial telemetry)
- `target/`, `node_modules/` (Binaries and packages)

---

## 🚨 6. Incident Response & Emergency Action

If any abnormal behavior or security concern arises:
1. **Kill Local Bridge**:
   ```powershell
   taskkill /f /im node.exe
   ```
2. **Halt Cloud Trading Engine**:
   ```bash
   ssh -i C:\Users\ankit\.ssh\id_gcp_deploy bharatos_user@127.0.0.1 "pm2 stop bharatos-funding"
   ```
3. **Revoke Binance API Keys**:
   Visit [Binance API Management](https://www.binance.com/en/my/settings/api-management) and click **"Delete All API Keys"** for immediate account lockdown.
