// index.js — the Brisk backend.
//
// Plain English: this is a small always-on web server. The phone app can't safely
// hold secrets (your Microsoft app password, your Anthropic AI key) or open the
// kind of connections email needs, so this server does those jobs and hands the
// app back tidy, ready-to-show data.
//
// What it does:
//   1. Microsoft 365 login   (/auth/microsoft/start  +  /auth/microsoft/callback)
//   2. Fetch your inbox      (POST /inbox)  — via Microsoft Graph
//   3. AI summaries          (built into /inbox, using Claude Haiku)
//   4. AI-written reply      (POST /draft)
//   5. Send a reply          (POST /send)
//
// Secrets live in environment variables (set on Render), never in this file:
//   MS_CLIENT_ID, MS_CLIENT_SECRET   — from your Azure app registration
//   ANTHROPIC_API_KEY                — from console.anthropic.com
//   SERVER_URL (optional)            — your public server URL, e.g. https://brisk.onrender.com

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.set('trust proxy', true);

// ── Live monitoring: time + tally every request (errors, latency) ─────────────
const SERVER_STARTED = Date.now();
const metrics = {}; // route -> { calls, errors, lastMs, totalMs, lastAt }
function track(route, ms, ok) {
  const m = metrics[route] || (metrics[route] = { calls: 0, errors: 0, lastMs: 0, totalMs: 0, lastAt: null });
  m.calls += 1; if (!ok) m.errors += 1;
  m.lastMs = ms; m.totalMs += ms; m.lastAt = new Date().toISOString();
}
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => track(`${req.method} ${req.path}`, Date.now() - t, res.statusCode < 400));
  next();
});

// ── AI usage meter (monthly) — keeps spend visible against a free-tier cap ─────
const AI_CAP = parseInt(process.env.AI_CAP || '1000', 10);
const freshUsage = () => ({ month: new Date().toISOString().slice(0, 7), summaries: 0, drafts: 0, signatures: 0, suggests: 0, asks: 0 });
let usage = freshUsage();
function bumpUsage(kind, n = 1) {
  const m = new Date().toISOString().slice(0, 7);
  if (usage.month !== m) usage = freshUsage();
  usage[kind] = (usage[kind] || 0) + n;
}
app.get('/usage', (_req, res) => {
  const total = usage.summaries + usage.drafts + usage.signatures + usage.suggests + usage.asks;
  res.json({ ...usage, total, cap: AI_CAP });
});

// ── Config ───────────────────────────────────────────────────────────────────
const MS_CLIENT_ID = process.env.MS_CLIENT_ID || '';
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';

// Where Microsoft sends the user back, and where we then bounce them into the app.
const APP_REDIRECT = 'brisk://auth';
// User.ReadWrite lets us set the user's M365 profile photo (what recipients see).
const MS_SCOPES = ['openid', 'profile', 'offline_access', 'User.ReadWrite', 'Mail.Read', 'Mail.Send'];
// 'common' = any account (needs the Azure app set to multi-tenant). For a
// single-tenant app, set MS_TENANT to your Directory (tenant) ID instead.
const MS_TENANT = process.env.MS_TENANT || 'common';
const MS_AUTH = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize`;
const MS_TOKEN = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`;
const GRAPH = 'https://graph.microsoft.com/v1.0';

function serverUrl(req) {
  if (process.env.SERVER_URL) return process.env.SERVER_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}
const redirectUri = (req) => `${serverUrl(req)}/auth/microsoft/callback`;

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.send('Scale Mail server is running ✅'));
app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    version: 'debug-10',
    microsoft: Boolean(MS_CLIENT_ID && MS_CLIENT_SECRET),
    ai: Boolean(ANTHROPIC_API_KEY),
    model: AI_MODEL,
    tenant: MS_TENANT,
  })
);

// No-login config check: shows the exact redirect URI the server computes, so we
// can compare it character-for-character with what's registered in Azure.
app.get('/debug', (req, res) =>
  res.json({
    version: 'debug-2',
    computedRedirectUri: redirectUri(req),
    tenant: MS_TENANT,
    clientIdPrefix: MS_CLIENT_ID.slice(0, 8),
    clientIdLength: MS_CLIENT_ID.length,
    secretSet: Boolean(MS_CLIENT_SECRET),
    secretLength: MS_CLIENT_SECRET.length,
    serverUrlEnv: process.env.SERVER_URL || null,
    host: req.get('host'),
    forwardedProto: req.headers['x-forwarded-proto'] || null,
  })
);

// ── Signature image hosting ──────────────────────────────────────────────────
// The app uploads a (small, pre-resized) signature photo here; we store it and
// hand back a public https URL. Emailed signatures point an <img> at that URL,
// which renders everywhere (Gmail included) — unlike inline data: URIs, which
// Gmail strips. Images are written to disk so they survive a process restart.
// Note: on Render's free tier the disk is wiped on each *redeploy*, so a photo
// may need re-uploading after a server update. (Upgrade path: a Render persistent
// disk, or an object store like Cloudinary/S3 — the API here stays the same.)
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
const TYPE_BY_EXT = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const MAX_IMG_BYTES = 500 * 1024;

app.post('/upload', (req, res) => {
  try {
    const { dataUri } = req.body || {};
    const m = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(String(dataUri || ''));
    if (!m) return res.status(400).json({ error: 'Expected an image data URI.' });
    const type = m[1].toLowerCase();
    const ext = EXT_BY_TYPE[type];
    if (!ext) return res.status(415).json({ error: 'Unsupported image type.' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMG_BYTES) return res.status(413).json({ error: 'Image too large.' });
    const id = newId();
    fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.${ext}`), buf);
    res.json({ url: `${serverUrl(req)}/img/${id}.${ext}` });
  } catch (e) {
    res.status(500).json({ error: e.message || 'upload failed' });
  }
});

app.get('/img/:file', (req, res) => {
  const file = path.basename(String(req.params.file || '')); // no path traversal
  const ext = file.split('.').pop().toLowerCase();
  const type = TYPE_BY_EXT[ext];
  const full = path.join(UPLOAD_DIR, file);
  if (!type || !fs.existsSync(full)) return res.status(404).send('not found');
  res.set('Content-Type', type);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(full).pipe(res);
});

// Delete a hosted image (from the user's saved-photos gallery).
app.delete('/img/:file', (req, res) => {
  const file = path.basename(String(req.params.file || ''));
  const full = path.join(UPLOAD_DIR, file);
  try { if (fs.existsSync(full)) fs.unlinkSync(full); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── 1. Microsoft login ───────────────────────────────────────────────────────
app.get('/auth/microsoft/start', (req, res) => {
  if (!MS_CLIENT_ID) return res.status(500).send('Server missing MS_CLIENT_ID');
  // The app tells us where to send the user back (its own deep link). We stash it
  // in `state` so we get it back on the callback. This makes it work in Expo Go
  // (an exp:// URL) and in a real build (brisk://) alike.
  const appRedirect = String(req.query.app_redirect || APP_REDIRECT);
  // `claim` is a secret nonce the app generated and already holds. We carry it
  // through OAuth `state` and store the token under it, so the app can claim the
  // token with a key it NEVER had to read back out of the (lossy) deep link.
  const claim = String(req.query.claim || '');
  const state = Buffer.from(JSON.stringify({ r: appRedirect, c: claim })).toString('base64url');
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(req),
    response_mode: 'query',
    scope: MS_SCOPES.join(' '),
    prompt: 'select_account',
    state,
  });
  res.redirect(`${MS_AUTH}?${params.toString()}`);
});

function decodeState(req) {
  const raw = req.query.state ? String(req.query.state) : '';
  try {
    const obj = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (obj && typeof obj === 'object' && obj.r) return { appRedirect: obj.r, claim: obj.c || '' };
  } catch (e) {}
  // Back-compat: older state was just base64(appRedirect).
  try { if (raw) return { appRedirect: Buffer.from(raw, 'base64url').toString('utf8'), claim: '' }; } catch (e) {}
  return { appRedirect: APP_REDIRECT, claim: '' };
}

function debugPage(ok, detail) {
  const color = ok ? '#0a7d33' : '#c0392b';
  const title = ok ? '✅ Login worked!' : '❌ Login failed';
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.5">
  <h2 style="color:${color}">${title}</h2>
  <p>${ok
    ? 'Your Azure app + server are configured correctly. The phone app should now sign in.'
    : 'Microsoft returned this error during the server token exchange:'}</p>
  <pre style="background:#f3f3f7;padding:14px;border-radius:10px;white-space:pre-wrap;word-break:break-word">${detail}</pre>
  </body>`;
}

// iOS in-app browsers sometimes hit the callback twice with the same code. The
// first redemption succeeds; a naive second would fail ("code already used" /
// malformed). We cache the redemption promise per code so duplicate/concurrent
// callbacks return the SAME successful result instead of erroring.
const codeRedemptions = new Map(); // code -> Promise<tokens>
function redeemCode(code, redirectUriValue) {
  if (codeRedemptions.has(code)) return codeRedemptions.get(code);
  const promise = msToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUriValue,
  });
  codeRedemptions.set(code, promise);
  setTimeout(() => codeRedemptions.delete(code), 5 * 60 * 1000).unref?.();
  return promise;
}

// A non-reversible fingerprint of an auth code: enough to tell two callbacks
// apart (or spot a duplicate) without ever logging the secret code itself.
function codeFingerprint(code) {
  const s = String(code || '');
  return { len: s.length, head: s.slice(0, 6), tail: s.slice(-6) };
}

// One-time token handoff. A Microsoft refresh token is ~1700 characters; pushing
// it back through the app's deep-link URL (exp://…?refresh=…) corrupts/truncates
// it on iOS, which then makes Graph reject it as "malformed" (AADSTS9002313).
// Instead we stash the token here under a short random id, hand the app only that
// id through the URL, and let the app trade it for the real token over HTTPS POST
// (where nothing can mangle it). The id is single-use and expires in 5 minutes.
//
// We persist to DISK (not just memory) so the token survives any process recycle
// between the callback and the claim — on Render's free tier those two requests
// can otherwise land on a fresh process with an empty in-memory map.
function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
}
// A short id unique to THIS server process — if a stored vs claimed handoff show
// different instances, we're being load-balanced and need shared storage.
const INSTANCE_ID = newId().slice(0, 6);
const HANDOFF_DIR = path.join(UPLOAD_DIR, '..', 'handoffs');
try { fs.mkdirSync(HANDOFF_DIR, { recursive: true }); } catch (e) {}
const handoffs = new Map(); // in-memory fast path; disk is the source of truth
const HANDOFF_TTL = 5 * 60 * 1000;

function makeHandoff(refreshToken, presetId) {
  // Prefer the app-supplied nonce (it already holds it); fall back to a fresh id.
  const id = presetId && String(presetId).length >= 16 ? String(presetId) : newId();
  const entry = { refreshToken, at: Date.now(), instance: INSTANCE_ID };
  handoffs.set(id, entry);
  try { fs.writeFileSync(path.join(HANDOFF_DIR, `${id}.json`), JSON.stringify(entry)); } catch (e) {}
  setTimeout(() => { handoffs.delete(id); try { fs.unlinkSync(path.join(HANDOFF_DIR, `${id}.json`)); } catch (e) {} }, HANDOFF_TTL).unref?.();
  return id;
}
// Consume a handoff (single use): try memory, then disk. Returns entry or null.
function takeHandoff(rawId) {
  const id = path.basename(String(rawId || '')); // guard against path traversal
  let entry = handoffs.get(id);
  if (!entry) {
    try {
      const raw = fs.readFileSync(path.join(HANDOFF_DIR, `${id}.json`), 'utf8');
      entry = JSON.parse(raw);
    } catch (e) { entry = null; }
  }
  if (!entry) return null;
  handoffs.delete(id);
  try { fs.unlinkSync(path.join(HANDOFF_DIR, `${id}.json`)); } catch (e) {}
  if (Date.now() - (entry.at || 0) > HANDOFF_TTL) return null;
  return entry;
}

// Flight recorder: last few callback attempts (no secrets) so we can debug remotely.
const recentCallbacks = [];
function record(entry) {
  recentCallbacks.unshift({ at: new Date().toISOString(), ...entry });
  recentCallbacks.length = Math.min(recentCallbacks.length, 12);
}
app.get('/debug/log', (_req, res) => res.json({ version: 'debug-10', recentCallbacks }));

// ── Live monitoring ──────────────────────────────────────────────────────────
// A snapshot of recent client-side events the app reports.
const clientEvents = [];
app.post('/debug/client-log', (req, res) => {
  const { level = 'info', event = '', detail = null, at } = req.body || {};
  clientEvents.unshift({ at: at || new Date().toISOString(), level, event: String(event).slice(0, 120), detail: detail ? String(JSON.stringify(detail)).slice(0, 500) : null });
  clientEvents.length = Math.min(clientEvents.length, 40);
  res.json({ ok: true });
});

app.get('/debug/status', (_req, res) => {
  res.json({
    version: 'debug-10',
    instance: INSTANCE_ID,
    uptimeSec: Math.round((Date.now() - SERVER_STARTED) / 1000),
    memoryMB: Math.round((process.memoryUsage().rss / 1048576) * 10) / 10,
    config: { microsoft: Boolean(MS_CLIENT_ID && MS_CLIENT_SECRET), ai: Boolean(ANTHROPIC_API_KEY), model: AI_MODEL, sigModel: SIG_MODEL, tenant: MS_TENANT },
    metrics,
    recentCallbacks: recentCallbacks.slice(0, 8),
    clientEvents: clientEvents.slice(0, 10),
  });
});

// A tiny human-readable dashboard for glancing at health from a browser.
app.get('/debug/dashboard', (_req, res) => {
  const rows = Object.entries(metrics).map(([r, m]) =>
    `<tr><td>${r}</td><td>${m.calls}</td><td style="color:${m.errors ? '#c0392b' : '#0a7d33'}">${m.errors}</td><td>${m.lastMs}ms</td><td>${Math.round(m.totalMs / m.calls)}ms</td><td>${m.lastAt || ''}</td></tr>`).join('');
  const ev = recentCallbacks.slice(0, 10).map((c) => `<li><code>${c.at}</code> — <b>${c.stage}</b> ${c.message ? `— ${String(c.message).slice(0, 90)}` : ''}</li>`).join('');
  res.send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
  <body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:820px;margin:30px auto;padding:0 16px">
  <h2>Scale Mail — live status</h2>
  <p>Instance <code>${INSTANCE_ID}</code> · up ${Math.round((Date.now() - SERVER_STARTED) / 1000)}s · ${Math.round(process.memoryUsage().rss / 1048576)}MB</p>
  <h3>Endpoints</h3>
  <table border=1 cellpadding=6 style="border-collapse:collapse;font-size:13px"><tr><th>route</th><th>calls</th><th>errors</th><th>last</th><th>avg</th><th>at</th></tr>${rows}</table>
  <h3>Recent auth/inbox events</h3><ul style="font-size:13px">${ev}</ul>
  <p style="color:#888;font-size:12px">Auto-updates on refresh · /debug/status for JSON</p></body>`);
});

app.get('/auth/microsoft/callback', async (req, res) => {
  const { appRedirect, claim } = decodeState(req);
  const debug = appRedirect === 'debug';
  const finish = (query, ok, detail) => {
    if (debug) return res.send(debugPage(ok, detail || query));
    const sep = appRedirect.includes('?') ? '&' : '?';
    return res.redirect(`${appRedirect}${sep}${query}`);
  };

  const { code, error, error_description } = req.query;
  const appRedirectKind = appRedirect.startsWith('exp') ? 'expo-go' : appRedirect.startsWith('brisk') ? 'native' : appRedirect.slice(0, 16);
  if (error) {
    record({ stage: 'authorize_error', error, error_description: String(error_description || ''), appRedirectKind });
    return finish(`error=${encodeURIComponent(error_description || error)}`, false, String(error_description || error));
  }
  if (!code) {
    record({ stage: 'missing_code', appRedirectKind });
    return finish('error=missing_code', false, 'No authorization code was returned by Microsoft.');
  }
  const fp = codeFingerprint(code);
  const duplicate = codeRedemptions.has(String(code));
  try {
    const tokens = await redeemCode(String(code), redirectUri(req));
    // Hand the app a short id (safe through the deep link); it claims the real
    // token over HTTPS. This is what fixes the "malformed" inbox error.
    const session = makeHandoff(tokens.refresh_token, claim);
    record({ stage: 'token_success', refreshLen: String(tokens.refresh_token || '').length, appRedirectKind, code: fp, duplicate, handoff: true, usedClaim: Boolean(claim), sid: session, sidLen: session.length, instance: INSTANCE_ID });
    // `session` goes FIRST so a tail-truncated deep link can't clip it.
    return finish(
      `session=${encodeURIComponent(session)}&provider=outlook`,
      true,
      `Refresh token received (length ${String(tokens.refresh_token || '').length}).`
    );
  } catch (e) {
    record({ stage: 'token_error', message: e.message, detail: e.detail || null, redirectUri: redirectUri(req), appRedirectKind, code: fp, duplicate });
    const full = e.detail
      ? `${e.message}\n\nredirect_uri used: ${redirectUri(req)}\ntenant: ${MS_TENANT}\n\nFull Microsoft response:\n${JSON.stringify(e.detail, null, 2)}`
      : e.message;
    return finish(`error=${encodeURIComponent(e.message)}`, false, full);
  }
});

// The app trades its one-time session id for the real refresh token, over HTTPS.
app.post('/auth/claim', (req, res) => {
  const { session } = req.body || {};
  const sid = String(session || '');
  const entry = session ? takeHandoff(session) : null;
  if (!entry) {
    record({ stage: 'claim_miss', sid, sidLen: sid.length, instance: INSTANCE_ID });
    return res.status(400).json({ error: 'This sign-in link expired. Please connect Outlook again.' });
  }
  record({ stage: 'claim_success', refreshLen: String(entry.refreshToken || '').length, sid, sidLen: sid.length, storedOn: entry.instance, instance: INSTANCE_ID });
  res.json({ refreshToken: entry.refreshToken });
});

// Exchange a code or refresh token for Microsoft access tokens.
async function msToken(extra) {
  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    scope: MS_SCOPES.join(' '),
    ...extra,
  });
  const r = await fetch(MS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await r.json();
  if (!r.ok) {
    const err = new Error(data.error_description || data.error || 'token exchange failed');
    err.detail = data; // full Microsoft error JSON for debugging
    throw err;
  }
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function accessTokenFromRefresh(refreshToken) {
  if (!refreshToken) throw new Error('not connected');
  const data = await msToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
}

// A Graph GET with a hard timeout so a slow call can't hang the request for 30s.
async function graphGet(url, accessToken, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal });
  } finally { clearTimeout(timer); }
}

const WELL_KNOWN_FOLDER = { inbox: 'inbox', sent: 'sentitems', drafts: 'drafts', archive: 'archive' };

// ── 2. Mailbox fetch (Graph) ─────────────────────────────────────────────────
// Pulls one folder (Inbox by default; also Sent/Drafts/Archive), newest first.
// Fast + resilient: pages up to `limit`, but if a later page fails or times out
// it returns what it already has instead of failing the whole load. No AI here —
// fetching is FREE; summaries are a separate cached step (/summarize).
app.post('/inbox', async (req, res) => {
  try {
    const { refreshToken, limit, folder } = req.body || {};
    const want = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 300);
    const fkey = WELL_KNOWN_FOLDER[String(folder || 'inbox').toLowerCase()] || 'inbox';
    const outgoing = fkey === 'sentitems' || fkey === 'drafts';
    const { accessToken, refreshToken: newRt } = await accessTokenFromRefresh(refreshToken);

    const pageSize = Math.min(want, 50); // Graph caps $top at 50 for messages
    let url =
      `${GRAPH}/me/mailFolders/${fkey}/messages?$top=${pageSize}` +
      `&$select=subject,from,toRecipients,bodyPreview,receivedDateTime,isRead,flag,inferenceClassification` +
      `&$orderby=receivedDateTime desc`;
    const raw = [];
    while (url && raw.length < want) {
      let data;
      try {
        const r = await graphGet(url, accessToken);
        data = await r.json();
        if (!r.ok) throw new Error(data.error?.message || 'Graph fetch failed');
      } catch (pageErr) {
        if (raw.length === 0) throw pageErr; // nothing yet → surface the error
        break; // got some → return partial rather than fail the whole load
      }
      raw.push(...(data.value || []));
      url = data['@odata.nextLink'] || null;
    }

    const emails = raw.slice(0, want).map((m) => {
      // For Sent/Drafts show who it's TO; otherwise show who it's FROM.
      const party = outgoing ? m.toRecipients?.[0]?.emailAddress : m.from?.emailAddress;
      return {
        id: m.id,
        account: 'outlook',
        folder: fkey,
        from: party ? `${party.name || party.address} <${party.address}>` : (outgoing ? 'Me' : ''),
        subject: m.subject || '(no subject)',
        body: stripHtml(m.bodyPreview || ''),
        preview: stripHtml(m.bodyPreview || ''), // stable text for categorization
        date: m.receivedDateTime || new Date().toISOString(),
        read: !!m.isRead,
        flagged: m.flag?.flagStatus === 'flagged',
        inferred: m.inferenceClassification || null, // 'focused' | 'other'
      };
    });

    record({ stage: 'inbox_success', folder: fkey, count: emails.length });
    res.json({ emails, refreshToken: newRt });
  } catch (e) {
    record({ stage: 'inbox_error', message: e.message, detail: e.detail || null });
    res.status(400).json({ error: e.message });
  }
});

// Strip the genuinely dangerous bits but keep formatting + links so the email
// renders like a real message (scripts/iframes/handlers/js: are the XSS risk).
function sanitizeHtml(html = '') {
  return String(html)
    .replace(/<\s*script[\s\S]*?<\/\s*script\s*>/gi, '')
    .replace(/<\s*style[\s\S]*?<\/\s*style\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

// Find the first meeting link (Join button) in the message.
function detectMeeting(s = '') {
  const text = String(s);
  const patterns = [
    { provider: 'Zoom', re: /https?:\/\/[\w.-]*zoom\.us\/[^\s"'<>)]+/i },
    { provider: 'Microsoft Teams', re: /https?:\/\/teams\.(?:microsoft|live)\.com\/[^\s"'<>)]+/i },
    { provider: 'Google Meet', re: /https?:\/\/meet\.google\.com\/[^\s"'<>)]+/i },
    { provider: 'Webex', re: /https?:\/\/[\w.-]*webex\.com\/[^\s"'<>)]+/i },
  ];
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) return { provider: p.provider, url: m[0].replace(/&amp;/g, '&') };
  }
  return null;
}

// Fetch the full body of one message (on demand, when an email is opened).
app.post('/message', async (req, res) => {
  try {
    const { refreshToken, id } = req.body || {};
    if (!id) throw new Error('missing id');
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const r = await fetch(`${GRAPH}/me/messages/${id}?$select=subject,from,body,bodyPreview,receivedDateTime`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const m = await r.json();
    if (!r.ok) throw new Error(m.error?.message || 'fetch failed');
    const rawHtml = m.body?.contentType === 'html' ? (m.body?.content || '') : '';
    const text = stripHtml(m.body?.content || m.bodyPreview || '');
    res.json({
      body: text,
      bodyHtml: rawHtml ? sanitizeHtml(rawHtml) : '',
      meeting: detectMeeting(`${m.body?.content || ''} ${text}`),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Whole-mailbox search (Graph $search across all folders) ──────────────────
app.post('/search', async (req, res) => {
  try {
    const { refreshToken, q } = req.body || {};
    const query = String(q || '').trim();
    if (!query) return res.json({ emails: [] });
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    // $search uses KQL and can't be combined with $orderby (results come ranked).
    const url = `${GRAPH}/me/messages?$search=${encodeURIComponent(`"${query}"`)}&$top=50` +
      `&$select=subject,from,toRecipients,bodyPreview,receivedDateTime,isRead,flag,inferenceClassification`;
    const r = await graphGet(url, accessToken);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Graph search failed');
    const emails = (data.value || []).map((m) => ({
      id: m.id,
      account: 'outlook',
      from: m.from?.emailAddress ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>` : '',
      subject: m.subject || '(no subject)',
      body: stripHtml(m.bodyPreview || ''),
      preview: stripHtml(m.bodyPreview || ''),
      date: m.receivedDateTime || new Date().toISOString(),
      read: !!m.isRead,
      flagged: m.flag?.flagStatus === 'flagged',
      inferred: m.inferenceClassification || null,
    }));
    record({ stage: 'search_ok', count: emails.length });
    res.json({ emails });
  } catch (e) {
    record({ stage: 'search_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// ── Profile photo (the avatar recipients see in their inbox) ─────────────────
app.post('/me/photo', async (req, res) => {
  try {
    const { refreshToken, dataUri } = req.body || {};
    const m = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(String(dataUri || ''));
    if (!m) return res.status(400).json({ error: 'Expected an image data URI.' });
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const r = await fetch(`${GRAPH}/me/photo/$value`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': m[1] },
      body: Buffer.from(m[2], 'base64'),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error?.message || `Couldn't set photo (${r.status}).`);
    }
    record({ stage: 'photo_set_ok' });
    res.json({ ok: true });
  } catch (e) {
    record({ stage: 'photo_set_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

app.post('/me/photo/get', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const r = await fetch(`${GRAPH}/me/photo/$value`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (r.status === 404) return res.json({ dataUri: null });
    if (!r.ok) throw new Error('photo fetch failed');
    const type = r.headers.get('content-type') || 'image/jpeg';
    const b64 = Buffer.from(await r.arrayBuffer()).toString('base64');
    res.json({ dataUri: `data:${type};base64,${b64}` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── AI chat over your mail: "pull all emails about X" ────────────────────────
app.post('/ask', async (req, res) => {
  try {
    const { refreshToken, q } = req.body || {};
    const query = String(q || '').trim();
    if (!query) return res.json({ answer: '', emails: [] });
    if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: 'AI not configured (set ANTHROPIC_API_KEY).' });
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const url = `${GRAPH}/me/messages?$search=${encodeURIComponent(`"${query}"`)}&$top=40` +
      `&$select=subject,from,toRecipients,bodyPreview,receivedDateTime,isRead,flag,inferenceClassification`;
    const r = await graphGet(url, accessToken);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Graph search failed');
    const all = (data.value || []).map((m) => ({
      id: m.id,
      account: 'outlook',
      from: m.from?.emailAddress ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>` : '',
      subject: m.subject || '(no subject)',
      body: stripHtml(m.bodyPreview || ''),
      preview: stripHtml(m.bodyPreview || ''),
      date: m.receivedDateTime || new Date().toISOString(),
      read: !!m.isRead,
      flagged: m.flag?.flagStatus === 'flagged',
      inferred: m.inferenceClassification || null,
    }));
    if (!all.length) return res.json({ answer: `I couldn't find any emails matching "${query}".`, emails: [] });

    const items = all.map((e) => ({ id: e.id, from: e.from, subject: e.subject, date: e.date, preview: e.body.slice(0, 200) }));
    const msg = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 900,
      system:
        'You help the user query their email. You are given their request and a JSON list ' +
        'of candidate emails (id, from, subject, date, preview) returned by a search. Answer ' +
        'the request concisely based ONLY on these, and pick the ids that are genuinely ' +
        'relevant. Reply ONLY JSON (no code fences): {"answer":"2-4 sentence answer","ids":' +
        '["id",...]}. If the request is just to "pull"/"show"/"find" emails, give a one-line ' +
        'answer and include all relevant ids.',
      messages: [{ role: 'user', content: `Request: ${query}\n\nCandidate emails:\n${JSON.stringify(items)}` }],
    });
    let text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const ids = new Set(parsed.ids || []);
    const picked = ids.size ? all.filter((e) => ids.has(e.id)) : all;
    bumpUsage('asks');
    record({ stage: 'ask_ok', matched: all.length, picked: picked.length });
    res.json({ answer: parsed.answer || '', emails: picked });
  } catch (e) {
    record({ stage: 'ask_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// ── Save a draft to the Outlook Drafts folder ────────────────────────────────
app.post('/draft-save', async (req, res) => {
  try {
    const { refreshToken, toEmail, subject, html, body } = req.body || {};
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const content = html ? { contentType: 'HTML', content: html } : { contentType: 'Text', content: body || '' };
    const message = { subject: subject || '(no subject)', body: content };
    if (toEmail) message.toRecipients = [{ emailAddress: { address: toEmail } }];
    const r = await fetch(`${GRAPH}/me/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'draft save failed');
    record({ stage: 'draft_save_ok' });
    res.json({ id: data.id });
  } catch (e) {
    record({ stage: 'draft_save_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// ── 3. Cheap, cacheable TL;DR summaries ──────────────────────────────────────
// The app sends ONLY emails it hasn't cached yet, so each message is summarized
// at most once, ever. Brief + direct: what it's about and why it matters.
app.post('/summarize', async (req, res) => {
  const started = Date.now();
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    if (!items.length) return res.json({ summaries: {} });
    const summaries = await aiSummarize(items.map((i) => ({
      id: i.id, from: i.from, subject: i.subject, body: i.preview || i.body || '',
    })));
    const n = Object.keys(summaries).length;
    bumpUsage('summaries', n);
    record({ stage: 'summarize_ok', count: n, ms: Date.now() - started });
    res.json({ summaries });
  } catch (e) {
    record({ stage: 'summarize_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// ── 4. AI-written reply draft ────────────────────────────────────────────────
app.post('/draft', async (req, res) => {
  try {
    const { subject, body, senderName, tone = 'professional', signature = 'Cameron' } = req.body || {};
    const text = await aiDraft({ subject, body, senderName, tone, signature });
    bumpUsage('drafts');
    record({ stage: 'draft_ok' });
    res.json({ text });
  } catch (e) {
    record({ stage: 'draft_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// ── 4c. AI writing suggestions for a compose draft ───────────────────────────
app.post('/suggest', async (req, res) => {
  try {
    const { body, context } = req.body || {};
    if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: 'AI not configured (set ANTHROPIC_API_KEY).' });
    if (!String(body || '').trim()) return res.json({ suggestions: [], improved: '' });
    const msg = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 1600,
      system:
        'You are an expert writing coach for professional email. Given an email DRAFT, ' +
        'reply with ONLY JSON (no code fences): ' +
        '{"suggestions":[{"type":"grammar|spelling|clarity|tone|persuasion",' +
        '"issue":"short problem","advice":"how to fix it","original":"the exact substring ' +
        'from the draft to replace (verbatim, or empty if not a simple swap)","replacement":' +
        '"the text to replace it with (empty if not a simple swap)"}],"improved":"the full ' +
        'improved email body"}. Cover grammar, spelling, conciseness, tone (flag if it reads ' +
        'too aggressive), and stronger persuasion/sales wording. When a fix is a clear phrase ' +
        'swap, fill original+replacement with verbatim text from/for the draft. Preserve the ' +
        'writer\'s voice and meaning. Max 6 suggestions.',
      messages: [{ role: 'user', content: `Context: ${context || 'general professional email'}\n\nDRAFT:\n${String(body).slice(0, 4000)}` }],
    });
    let text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    bumpUsage('suggests');
    record({ stage: 'suggest_ok', n: (parsed.suggestions || []).length });
    res.json({ suggestions: parsed.suggestions || [], improved: parsed.improved || '', model: AI_MODEL });
  } catch (e) {
    record({ stage: 'suggest_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// ── 4b. AI-generated email signature ─────────────────────────────────────────
// Each named style points at a reference image. We send that image + the user's
// real details to Claude and ask it to *design a fresh signature* in that style —
// not fill a template. This means the look is generated by AI every time.
const REFS_DIR = path.join(process.cwd(), 'refs');
const SIG_MODEL = process.env.SIG_MODEL || 'claude-sonnet-4-6';
const SIG_STYLES = {
  luxury: {
    file: 'luxury.jpeg', media: 'image/jpeg',
    brief: 'Warm, upscale, architectural feel. Earthy tan/gold + black + cream palette with subtle abstract corner shapes. Circular photo on the left over a clean panel. Two-tone name (dark first name, gold/tan last name), small uppercase title. Labeled contact rows ("Phone number", "Email", "Address"). A dark rounded company block on the right with a small icon, the company name and a slogan, plus small social icons and the website.',
  },
  bold: {
    file: 'bold.jpeg', media: 'image/jpeg',
    brief: 'IMPORTANT: base the design specifically on the MIDDLE signature in the reference image — the blue one with the angular/chevron panel. Strong blue brand color with diagonal/arrow geometry. A blue panel on the left holding the company name (white) + tagline + social icons, the photo set into a chevron cut, and on the right a two-tone name (dark + blue), uppercase title with a short accent underline, and contact rows each led by a small blue circular icon.',
  },
  card: {
    file: 'card.webp', media: 'image/webp',
    brief: 'Clean, centered, friendly card. A large circular photo centered at the top, then the centered bold name, title and company. A thin horizontal divider. Left-aligned contact rows (phone, email, website, address) with small simple gray icons, with the social icons grouped to the right. Finish with a rounded gold/amber call-to-action button (e.g. "Book a Call With Me").',
  },
  executive: {
    file: 'executive.webp', media: 'image/webp',
    brief: 'Polished, modern executive look. Optionally open with a handwritten-style "Best regards," in a script feel. Bold name with "Title, Company" beneath. A single tidy row of contact details (phone, website, email) each led by a small blue icon. Place the company logo/name to the right. Finish with a dark rounded marketing banner containing a short headline and a bright "Book a Demo"-style button.',
  },
};
const SIG_SYSTEM =
  'You are an expert email-signature designer. You are given a REFERENCE IMAGE of a ' +
  'signature design and a person\'s real details. Design a NEW HTML email signature that ' +
  'closely captures the reference\'s layout, color palette, typography and decorative feel, ' +
  'but uses ONLY the person\'s real details. Hard requirements:\n' +
  '- Output ONLY raw HTML (no markdown, no code fences, no commentary).\n' +
  '- Email-safe HTML ONLY: a single root <table> with inline styles, web-safe fonts ' +
  '(Arial/Helvetica/Georgia), no <style> blocks, no <script>, no external CSS, no JS.\n' +
  '- If a photo URL is provided, use it in an <img> framed as the reference does. ' +
  'If NO photo is provided, do NOT leave a blank/broken image area: instead render a ' +
  'tasteful monogram badge (the person\'s initials in a colored circle using the accent ' +
  'color) OR a clean, balanced text-only layout. The result must look polished and ' +
  'intentional with no empty gaps. Keep max width ~520px.\n' +
  '- Include EVERY field the person provided (name, title, company, tagline, phone, email, ' +
  'website, location, and any socials) — never drop information. Only omit a field if it is ' +
  'absent. Never invent data or use lorem ipsum.\n' +
  '- For icons use simple emoji (📞 ✉️ 🌐 📍) or small colored shapes — never icon fonts.\n' +
  '- Make links real: tel:, mailto:, and https:// for website/socials.\n' +
  '- Do NOT add any "sent from" / footer line — that is added separately.';

app.post('/signature/generate', async (req, res) => {
  const started = Date.now();
  try {
    const { style, details } = req.body || {};
    const cfg = SIG_STYLES[String(style || '').toLowerCase()];
    if (!cfg) return res.status(400).json({ error: `Unknown style "${style}".` });
    if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: 'AI not configured (set ANTHROPIC_API_KEY).' });
    const imgData = fs.readFileSync(path.join(REFS_DIR, cfg.file)).toString('base64');
    const msg = await anthropic().messages.create({
      model: SIG_MODEL,
      max_tokens: 2200,
      system: SIG_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: cfg.media, data: imgData } },
          { type: 'text', text: `Reference style notes: ${cfg.brief}\n\nPerson's details (JSON):\n${JSON.stringify(details || {}, null, 2)}\n\nDesign the signature HTML now.` },
        ],
      }],
    });
    let html = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    html = html.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim(); // strip any stray fences
    bumpUsage('signatures');
    record({ stage: 'sig_generate_ok', style, ms: Date.now() - started });
    res.json({ html });
  } catch (e) {
    record({ stage: 'sig_generate_error', message: e.message, ms: Date.now() - started });
    res.status(400).json({ error: e.message });
  }
});

// ── 5. Send a reply ──────────────────────────────────────────────────────────
app.post('/send', async (req, res) => {
  try {
    const { refreshToken, toEmail, subject, body, html, inReplyToId } = req.body || {};
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const content = html
      ? { contentType: 'HTML', content: html }
      : { contentType: 'Text', content: body || '' };

    let r;
    if (inReplyToId) {
      // Reply on the original thread (keeps the conversation together).
      // /reply requires a draft + send for HTML bodies, so use the message body.
      r = await fetch(`${GRAPH}/me/messages/${inReplyToId}/reply`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ message: { body: content } }),
      });
    } else {
      r = await fetch(`${GRAPH}/me/sendMail`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({
          message: {
            subject: subject || '(no subject)',
            body: content,
            toRecipients: [{ emailAddress: { address: toEmail } }],
          },
          saveToSentItems: true,
        }),
      });
    }
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error?.message || `send failed (${r.status})`);
    }
    record({ stage: 'send_ok', reply: Boolean(inReplyToId) });
    res.json({ ok: true });
  } catch (e) {
    record({ stage: 'send_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// ── Claude helpers ───────────────────────────────────────────────────────────
function anthropic() {
  if (!ANTHROPIC_API_KEY) throw new Error('AI not configured (set ANTHROPIC_API_KEY)');
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

// One cheap batched call: summarize every email into a single tight sentence.
async function aiSummarize(emails) {
  if (!ANTHROPIC_API_KEY || emails.length === 0) return {};
  try {
    const items = emails.map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      body: (e.body || '').slice(0, 600),
    }));
    const msg = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 1500,
      system:
        'You write TL;DR previews of work emails for a busy executive. For each email, ' +
        'write a brief, direct summary (max 2 short lines, ~30 words) covering what it is ' +
        'about AND why it matters / what it wants. No greetings, no fluff. ' +
        'Reply with ONLY a JSON array of {"id","summary"} — no prose, no code fences.',
      messages: [{ role: 'user', content: JSON.stringify(items) }],
    });
    const text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('');
    const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    const out = {};
    arr.forEach((x) => { if (x && x.id) out[x.id] = String(x.summary || '').trim(); });
    return out;
  } catch (e) {
    console.warn('aiSummarize failed:', e.message);
    return {}; // fall back to the app's on-device summary
  }
}

// Write a full reply in the chosen tone, signed off with the user's name.
async function aiDraft({ subject, body, senderName, tone, signature }) {
  const toneNote = {
    professional: 'professional and courteous',
    friendly: 'warm and friendly, lightly casual',
    brief: 'very brief and to the point',
  }[tone] || 'professional and courteous';

  const msg = await anthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 700,
    system:
      `You write email replies on behalf of ${signature}. Tone: ${toneNote}. ` +
      `Start with a greeting to the sender's first name, write a complete reply that ` +
      `addresses the message, and sign off as ${signature}. Output ONLY the email text.`,
    messages: [{
      role: 'user',
      content: `Reply to this email.\n\nFrom: ${senderName}\nSubject: ${subject}\n\n${(body || '').slice(0, 2000)}`,
    }],
  });
  return (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
}

function stripHtml(s = '') {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Brisk server listening on ${PORT}`));
