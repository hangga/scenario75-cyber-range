const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const LOG_DIR = '/opt/admin/logs';
const ERROR_LOG = path.join(LOG_DIR, 'error.log');

fs.mkdirSync(LOG_DIR, { recursive: true });

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Node.js');
  next();
});
app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, '../public')));

const feedback = [];

function logError(message, timestamp = null) {
  const ts = timestamp || new Date().toISOString();
  fs.appendFileSync(ERROR_LOG, `${ts} ${message}\n`);
}

function preMfaCookie(res) {
  res.cookie('pre_mfa_session', 'pending_mfa_verification', {
    httpOnly: false,
    sameSite: 'lax',
    path: '/'
  });
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/*
 * Deliberately weak WAF for the training scenario.
 * It is not a security control and must never be copied to production.
 */
function scenarioWaf(req, res, next) {
  if (req.method !== 'POST' || req.path !== '/feedback') return next();

  const body = String(req.body.message || '');
  const lower = body.toLowerCase();

  if (lower.includes('<script')) {
    logError('WAF block: blocked keyword <script> from attacker simulation');
    return res.status(403).send('Forbidden by training WAF');
  }

  if (lower.includes('document.cookie') || lower.includes('document[\'cookie\']')) {
    logError('WAF block: blocked direct cookie access from attacker simulation');
    return res.status(403).send('Forbidden by training WAF');
  }

  next();
}

app.use(scenarioWaf);

app.get('/', (req, res) => {
  preMfaCookie(res);
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
`User-agent: *
Disallow: /api/verify-mfa
Disallow: /dashboard
`
  );
});

app.post('/feedback', (req, res) => {
  const message = String(req.body.message || '');
  feedback.push({ message, createdAt: new Date().toISOString() });

  /*
   * The challenge intentionally reflects the submitted HTML.
   * In a real application this must be escaped/sanitized.
   */
  res.status(201).type('html').send(`
<!doctype html>
<html>
<head><title>Feedback received</title></head>
<body>
  <h1>Feedback received</h1>
  <div id="feedback">${message}</div>
  <p><a href="/">Back</a></p>
</body>
</html>
`);
});

app.get('/api/verify-mfa', (req, res) => {
  const pre = req.cookies.pre_mfa_session;
  if (pre !== 'pending_mfa_verification') {
    return res.status(401).json({ ok: false, error: 'MFA session missing' });
  }
  if (String(req.query.code || '') !== '7531') {
    return res.status(401).json({ ok: false, error: 'Invalid MFA code' });
  }

  const admin = `adm_sess_mfa_${Buffer.from(pre).toString('base64url').slice(0, 12)}`;
  res.cookie('adm_sess', admin, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ ok: true, message: 'MFA verified' });
});

/*
 * Training-only endpoint representing a stolen-cookie replay.
 * It deliberately does not call /api/verify-mfa.
 */
app.get('/api/session/replay', (req, res) => {
  const stolen = String(req.cookies.pre_mfa_session || req.query.pre_mfa_session || '');

  if (stolen !== 'pending_mfa_verification') {
    return res.status(401).json({ ok: false, error: 'Invalid stolen session' });
  }

  const admin = `adm_sess_replay_${Buffer.from(stolen).toString('base64url').slice(0, 12)}`;
  logError('CRITICAL cookie reuse event: pre_mfa_session replay promoted to admin session');
  res.cookie('adm_sess', admin, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ ok: true, bypassedMfa: true, session: admin });
});

app.post('/api/telemetry', (req, res) => {
  /*
   * A harmless local collector used by the challenge to make the XSS
   * exfiltration step visible without sending data to a real third party.
   */
  const value = String(req.body.cookie || '');
  if (value.includes('pending_mfa_verification')) {
    logError('CRITICAL cookie reuse event: attacker collected pre_mfa_session');
  }
  res.json({ ok: true });
});

app.get('/dashboard', (req, res) => {
  const admin = req.cookies.adm_sess;
  if (!admin || !admin.startsWith('adm_sess')) {
    return res.status(302).set('Location', '/').end();
  }

  const reflected = req.query.payload ? String(req.query.payload) : '';
  const safeFeedback = feedback
    .map(item => `<li>${item.message}</li>`)
    .join('');

  res.type('html').send(`
<!doctype html>
<html>
<head><title>Admin Dashboard</title></head>
<body>
  <h1>Restricted Admin Dashboard</h1>
  <p>Authenticated session: ${htmlEscape(admin)}</p>
  <div class="feedback-list"><ul>${safeFeedback}</ul></div>
  <div class="xss-payload">${reflected}</div>
</body>
</html>
`);
});

app.get('/healthz', (req, res) => res.json({ ok: true, service: 'scenario75' }));

app.use((err, req, res, next) => {
  logError(`Application error: ${err.message}`);
  res.status(500).send('Internal server error');
});

app.listen(PORT, () => {
  console.log(`Scenario75 app listening on ${PORT}`);
});
