const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);          // app tetap 3000, nginx yang map ke 3075
const LOG_DIR = process.env.LOG_DIR || '/opt/admin/logs';

const RED_FLAG  = 'SCENARIO75{RED_C00k13_MFA_Byp4ss_0wn3d}';
const BLUE_FLAG = 'SCENARIO75{BLUE_L0g_Hunt3r_M4st3r}';
const BLUE_FLAG_B64 = Buffer.from(BLUE_FLAG).toString('base64');

// ---------- Log dir & fallback ----------
let logDir = LOG_DIR;
try {
  fs.mkdirSync(logDir, { recursive: true });
  fs.accessSync(logDir, fs.constants.W_OK);
} catch (e) {
  logDir = path.join(__dirname, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  console.warn(`[warn] ${LOG_DIR} tidak writable, fallback ke ${logDir}`);
}
const ACCESS_LOG_PATH = path.join(logDir, 'access.log');
const ERROR_LOG_PATH  = path.join(logDir, 'error.log');

const timeOnly = (d = new Date()) => d.toTimeString().slice(0, 8);

function logError(message, timestamp = null) {
  try {
    fs.appendFileSync(ERROR_LOG_PATH, `${timestamp || timeOnly()} ${message}\n`);
  } catch (e) { console.error('logError failed:', e.message); }
}

function logAccess(req, res) {
  const ts  = timeOnly();
  const ip  = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';
  const xff = req.headers['x-forwarded-for']
    ? ` X-Forwarded-For: ${req.headers['x-forwarded-for']}` : '';
  const adm = req.cookies && req.cookies.adm_sess
    ? ` adm_sess=${req.cookies.adm_sess}` : '';
  const line = `${ts} ${ip} ${req.method} ${req.originalUrl} ${res.statusCode}${xff}${adm}`;
  try { fs.appendFileSync(ACCESS_LOG_PATH, line + '\n'); }
  catch (e) { console.error('logAccess failed:', e.message); }
}

function seedLogs() {
  const accessSeed =
    '18:50:15 10.10.14.50 POST /feedback 403 X-Forwarded-For: 10.10.14.50\n' +
    '18:50:16 10.10.14.50 POST /feedback 201 X-Forwarded-For: 10.10.14.50\n' +
    '18:51:55 10.10.14.50 GET /dashboard 200 X-Forwarded-For: 10.10.14.50 adm_sess=adm_sess_replay_demo\n' +
    `18:53:10 10.10.14.50 GET /api/session/replay 200 X-Forwarded-For: ${BLUE_FLAG_B64} adm_sess=adm_sess_replay_demo\n`;
  const errorSeed =
    '18:50:15 WAF block: blocked keyword <script> from attacker simulation\n' +
    '18:53:10 Authentication bypass anomaly\n' +
    '18:53:10 CRITICAL cookie reuse event: pre_mfa_session replay promoted to admin session\n';
  try {
    if (!fs.existsSync(ACCESS_LOG_PATH) || fs.statSync(ACCESS_LOG_PATH).size === 0)
      fs.writeFileSync(ACCESS_LOG_PATH, accessSeed);
    if (!fs.existsSync(ERROR_LOG_PATH) || fs.statSync(ERROR_LOG_PATH).size === 0)
      fs.writeFileSync(ERROR_LOG_PATH, errorSeed);
  } catch (e) { console.error('seedLogs failed:', e.message); }
}
seedLogs();

// ---------- Express ----------
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Node.js');
  next();
});

app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));

// ============================================================
// BULLETPROOF: paksa Set-Cookie pre_mfa_session untuk GET / dan /index.html
// dijalankan SEBELUM static / handler apa pun.
// ============================================================
function preMfaCookie(res) {
  res.cookie('pre_mfa_session', 'pending_mfa_verification', {
    httpOnly: false,
    sameSite: 'lax',
    path: '/'
  });
}

app.use((req, res, next) => {
  if (req.method === 'GET' &&
      (req.path === '/' || req.path === '/index.html')) {
    preMfaCookie(res);
  }
  next();
});

// access log
app.use((req, res, next) => {
  res.on('finish', () => logAccess(req, res));
  next();
});

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ---------- WAF latihan ----------
function scenarioWaf(req, res, next) {
  if (req.method !== 'POST' || req.path !== '/feedback') return next();
  const lower = String(req.body.message || '').toLowerCase();

  if (lower.includes('<script')) {
    logError('WAF block: blocked keyword <script> from attacker simulation');
    return res.status(403).send('Forbidden by training WAF');
  }
  if (lower.includes('document.cookie') ||
      lower.includes("document['cookie']") ||
      lower.includes('document["cookie"]')) {
    logError('WAF block: blocked direct cookie access from attacker simulation');
    return res.status(403).send('Forbidden by training WAF');
  }
  next();
}
app.use(scenarioWaf);

// ---------- Explicit route GET / (di atas static) ----------
app.get('/', (req, res) => {
  const indexFile = path.join(__dirname, '../public/index.html');
  if (fs.existsSync(indexFile)) {
    // pastikan browser tidak cache supaya Set-Cookie selalu kelihatan di curl -i
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(indexFile);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html>
<html><head><title>Scenario75</title></head>
<body>
  <h1>Scenario75 Training Range</h1>
  <form method="POST" action="/feedback">
    <input name="message" placeholder="message"/>
    <button type="submit">Send</button>
  </form>
</body></html>`);
});

// static HANYA untuk aset lain, dan index dimatikan total
app.use(express.static(path.join(__dirname, '../public'), {
  index: false,
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
}));

// ---------- robots.txt ----------
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
`User-agent: *
Disallow: /api/verify-mfa
Disallow: /dashboard
`);
});

// ---------- feedback (reflected, sengaja XSS) ----------
const feedback = [];
app.post('/feedback', (req, res) => {
  const message = String(req.body.message || '');
  feedback.push({ message, createdAt: new Date().toISOString() });
  res.status(201).type('html').send(`
<!doctype html>
<html><head><title>Feedback received</title></head>
<body>
  <h1>Feedback received</h1>
  <div id="feedback">${message}</div>
  <p><a href="/">Back</a></p>
</body></html>`);
});

// ---------- MFA ----------
app.get('/api/verify-mfa', (req, res) => {
  const pre = req.cookies.pre_mfa_session;
  if (pre !== 'pending_mfa_verification')
    return res.status(401).json({ ok: false, error: 'MFA session missing' });
  if (String(req.query.code || '') !== '7531')
    return res.status(401).json({ ok: false, error: 'Invalid MFA code' });

  const admin = `adm_sess_mfa_${Buffer.from(pre).toString('base64url').slice(0, 12)}`;
  res.cookie('adm_sess', admin, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ ok: true, message: 'MFA verified' });
});

// ---------- replay ----------
app.get('/api/session/replay', (req, res) => {
  const stolen = String(req.cookies.pre_mfa_session || req.query.pre_mfa_session || '');
  if (stolen !== 'pending_mfa_verification')
    return res.status(401).json({ ok: false, error: 'Invalid stolen session' });

  const admin = `adm_sess_replay_${Buffer.from(stolen).toString('base64url').slice(0, 12)}`;
  logError('CRITICAL cookie reuse event: pre_mfa_session replay promoted to admin session');
  logError('Authentication bypass anomaly');
  res.cookie('adm_sess', admin, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ ok: true, bypassedMfa: true, session: admin });
});

// ---------- telemetry ----------
app.post('/api/telemetry', (req, res) => {
  const value = String(req.body.cookie || '');
  if (value.includes('pending_mfa_verification'))
    logError('CRITICAL cookie reuse event: attacker collected pre_mfa_session');
  res.json({ ok: true });
});

// ---------- dashboard ----------
app.get('/dashboard', (req, res) => {
  const admin = req.cookies.adm_sess;
  if (!admin || !admin.startsWith('adm_sess'))
    return res.status(302).set('Location', '/').end();

  const reflected   = req.query.payload ? String(req.query.payload) : '';
  const safeFeedback = feedback.map(i => `<li>${i.message}</li>`).join('');

  res.type('html').send(`
<!doctype html>
<html><head><title>Admin Dashboard</title></head>
<body>
  <h1>Restricted Admin Dashboard</h1>
  <p>Authenticated session: ${htmlEscape(admin)}</p>
  <p>Flag: ${RED_FLAG}</p>
  <div class="feedback-list"><ul>${safeFeedback}</ul></div>
  <div class="xss-payload">${reflected}</div>
</body></html>`);
});

// ---------- debug & health ----------
app.get('/healthz', (req, res) => res.json({ ok: true, service: 'scenario75' }));
app.get('/__debug', (req, res) =>
  res.json({ port: PORT, logDir, pid: process.pid, version: 'v2-fix-cookie' })
);

app.use((err, req, res, next) => {
  logError(`Application error: ${err.message}`);
  res.status(500).send('Internal server error');
});

app.listen(PORT, () => {
  console.log(`Scenario75 app listening on ${PORT} (v2-fix-cookie)`);
  console.log(`Logs: ${logDir}`);
});