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
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { icloudVerify, icloudInbox, icloudMessage, icloudAttachment, icloudAction, icloudFolders, icloudSend, icloudCalendar } from './icloud.js';

// ── At-rest encryption (NDA hardening) ───────────────────────────────────────
// Anything sensitive we persist to disk (OAuth handoffs, AI summaries / next-steps
// derived from email content) is encrypted with AES-256-GCM under SERVER_ENC_KEY.
// If no key is configured, we DO NOT write that data to disk at all (in-memory
// only) — so plaintext email-derived content never lands on the server's disk.
const ENC_KEY = (() => {
  const raw = (process.env.SERVER_ENC_KEY || '').trim();
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest(); // accept any passphrase
})();
function encStr(obj) {
  if (!ENC_KEY) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}
function decStr(str) {
  try {
    if (!ENC_KEY || typeof str !== 'string' || !str.startsWith('v1:')) return null;
    const [, ivB, tagB, dataB] = str.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB, 'base64'));
    d.setAuthTag(Buffer.from(tagB, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]).toString('utf8'));
  } catch (e) { return null; }
}
// Encrypted-or-skip JSON file persistence (never writes plaintext sensitive data).
function writeSecure(file, obj) {
  if (!ENC_KEY) return; // no key → don't persist sensitive data in plaintext
  try { fs.writeFileSync(file, encStr(obj)); } catch (e) { /* best-effort */ }
}
function readSecure(file) {
  try { const v = decStr(fs.readFileSync(file, 'utf8')); return v || {}; } catch (e) { return {}; }
}

// Debug/observability endpoints expose operational metadata — gate them behind a
// secret so they're never publicly readable. Disabled entirely unless DEBUG_TOKEN
// is set.
const DEBUG_TOKEN = (process.env.DEBUG_TOKEN || '').trim();
function debugAuth(req, res, next) {
  if (!DEBUG_TOKEN) return res.status(404).send('not found');
  const t = req.get('x-debug-token') || req.query.token || '';
  if (t !== DEBUG_TOKEN) return res.status(404).send('not found');
  next();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// Render puts exactly ONE proxy hop in front of us. `true` would trust the whole
// (attacker-supplied) X-Forwarded-For chain, letting anyone spoof req.ip to bypass
// the rate limiter or lock a victim out; `1` uses the single real client IP Render
// appends.
app.set('trust proxy', 1);

// ── Security middleware (NDA hardening) ──────────────────────────────────────
// 1) Baseline response headers.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  // Force HTTPS for a year (Render terminates TLS in front of us). Browsers that
  // have seen this header will refuse to ever downgrade a request to plain HTTP.
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // This API serves no interactive pages that need device sensors.
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// 2) Per-IP rate limiting (always on) so the backend can't be scraped / DoS'd and
// nobody can burn the AI budget. AI endpoints get a tighter ceiling. In-memory
// sliding window — fine for a single instance; swap for Redis when you scale out.
// Match by PREFIX so the expensive real routes (/signature/generate, /voice-format,
// /learn/profile) actually fall under the tight AI ceiling.
const AI_PREFIXES = ['/summarize', '/ask', '/next-steps', '/suggest', '/learn-keep', '/quick-replies', '/draft', '/signature', '/learn', '/snooze-suggest', '/relationship', '/digest', '/voice', '/profile'];
const isAiPath = (p) => AI_PREFIXES.some((x) => p === x || p.startsWith(x + '/') || p.startsWith(x));
const rlBuckets = new Map(); // ip -> { count, resetAt }
const RL_WINDOW_MS = 60 * 1000;
const RL_MAX = parseInt(process.env.RATE_LIMIT_PER_MIN || '240', 10);
const RL_AI_MAX = parseInt(process.env.RATE_LIMIT_AI_PER_MIN || '50', 10);
const RL_MAX_BUCKETS = 50000; // bound memory even under a spoofing attempt
setInterval(() => { const now = Date.now(); for (const [ip, e] of rlBuckets) if (now > e.resetAt) rlBuckets.delete(ip); }, 5 * 60 * 1000).unref?.();
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const ai = isAiPath(req.path);
  const ip = req.ip || req.socket?.remoteAddress || 'x';
  const key = `${ip}:${ai ? 'ai' : 'all'}`;
  const max = ai ? RL_AI_MAX : RL_MAX;
  const now = Date.now();
  let e = rlBuckets.get(key);
  if (!e || now > e.resetAt) { if (rlBuckets.size > RL_MAX_BUCKETS) rlBuckets.clear(); e = { count: 0, resetAt: now + RL_WINDOW_MS }; rlBuckets.set(key, e); }
  e.count += 1;
  if (e.count > max) { res.set('Retry-After', Math.ceil((e.resetAt - now) / 1000)); return res.status(429).json({ error: 'Too many requests' }); }
  next();
});

// 3) App-to-backend key. Enforced ONLY when APP_API_KEY is set on the server, so
// the live app keeps working until you opt in (set APP_API_KEY here + the matching
// EXPO_PUBLIC_APP_KEY in the app build). Public/browser/mail-client routes are
// exempt: health, OAuth, image GETs, and the (separately token-gated) debug pages.
const APP_API_KEY = (process.env.APP_API_KEY || '').trim();
function isPublicPath(p, method) {
  if (p === '/' || p === '/health' || p === '/usage') return true;
  if (p.startsWith('/auth/')) return true;             // OAuth happens in a browser
  // Debug PAGES are viewed in a browser (can't send x-app-key) and are already
  // behind DEBUG_TOKEN. POSTs to /debug (the app's client-log) come from the app,
  // which always attaches the key — so require it there like everywhere else.
  if (p.startsWith('/debug') && method === 'GET') return true;
  if (p.startsWith('/img/') && method === 'GET') return true; // mail clients fetch signature images
  if (p.startsWith('/calendar/ics')) return true;      // calendar feed URLs
  return false;
}
app.use((req, res, next) => {
  if (!APP_API_KEY) return next();          // not configured → don't enforce yet
  if (req.method === 'OPTIONS') return next();
  if (isPublicPath(req.path, req.method)) return next();
  if ((req.get('x-app-key') || '') !== APP_API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
});

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
// Disk-backed so the tally survives the server sleeping/waking (Render free tier),
// instead of resetting to zero every time the process restarts.
const AI_CAP = parseInt(process.env.AI_CAP || '1000', 10);
const USAGE_FILE = path.join(process.cwd(), 'usage.json');
const freshUsage = () => ({ month: new Date().toISOString().slice(0, 7), summaries: 0, drafts: 0, signatures: 0, suggests: 0, asks: 0 });
let usage = freshUsage();
try {
  const saved = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  if (saved && saved.month === usage.month) usage = { ...usage, ...saved };
} catch (e) { /* no saved usage yet */ }
function bumpUsage(kind, n = 1) {
  const m = new Date().toISOString().slice(0, 7);
  if (usage.month !== m) usage = freshUsage();
  usage[kind] = (usage[kind] || 0) + n;
  try { fs.writeFileSync(USAGE_FILE, JSON.stringify(usage)); } catch (e) { /* best-effort */ }
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
// Keep the core scope set to what existing sign-ins consented to (User.Read), so
// mail keeps loading. Setting the M365 profile photo would need User.ReadWrite and
// a re-consent; that's an optional opt-in rather than something that breaks login.
// Calendars.ReadWrite lets the app show upcoming events and RSVP to invites. It's
// only requested at sign-in (authorize), never on refresh, so existing tokens keep
// working — a user re-connects once to grant calendar access.
// Mail.ReadWrite (superset of Mail.Read) is required to mark read/unread and to
// move messages (archive / trash / report junk) — Mail.Read alone returns
// "Access is denied" on those. Adding it requires users to reconnect once.
const MS_SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite'];
// 'common' = any account (needs the Azure app set to multi-tenant). For a
// single-tenant app, set MS_TENANT to your Directory (tenant) ID instead.
const MS_TENANT = process.env.MS_TENANT || 'common';
const MS_AUTH = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize`;
const MS_TOKEN = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`;
const GRAPH = 'https://graph.microsoft.com/v1.0';

// ── Google / Gmail config (mirrors the Microsoft setup) ──────────────────────
// Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (a Google Cloud OAuth "Web" client)
// on the server to turn Gmail on. Until then the Gmail endpoints report not-set.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GCAL = 'https://www.googleapis.com/calendar/v3';
// gmail.modify = read + change labels (mark read/archive); send = send mail.
// calendar.events = read upcoming events + RSVP (update your attendee status).
const GOOGLE_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
];

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
    version: 'debug-47',
    microsoft: Boolean(MS_CLIENT_ID && MS_CLIENT_SECRET),
    google: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    ai: Boolean(ANTHROPIC_API_KEY),
    model: AI_MODEL,
    tenant: MS_TENANT,
  })
);

// No-login config check: shows the exact redirect URI the server computes, so we
// can compare it character-for-character with what's registered in Azure.
app.get('/debug', debugAuth, (req, res) =>
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

app.post('/upload', async (req, res) => {
  try {
    const { dataUri } = req.body || {};
    const m = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(String(dataUri || ''));
    if (!m) return res.status(400).json({ error: 'Expected an image data URI.' });
    const type = m[1].toLowerCase();
    const ext = EXT_BY_TYPE[type];
    if (!ext) return res.status(415).json({ error: 'Unsupported image type.' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMG_BYTES) return res.status(413).json({ error: 'Image too large.' });

    // Host on OUR OWN backend only — never a public/anonymous third-party host.
    // (Signature photos are the only thing that flows here; email content never
    // does. For production, point UPLOAD_DIR at a private object store / signed
    // URLs — the API contract stays the same.)
    const id = newId();
    fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.${ext}`), buf);
    record({ stage: 'upload_ok', host: 'local' });
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

// SECURITY: only ever redirect the OAuth result to OUR app's deep links (or the
// debug sentinel). Without this, an attacker could send a victim a real Microsoft/
// Google login link with ?app_redirect=https://evil.com and receive the session id
// on their server, then claim the full mailbox refresh token. Anything not on the
// allowlist falls back to the app's own scheme.
function safeAppRedirect(v) {
  const s = String(v || '');
  if (s === 'debug') return s;
  if (/^brisk:\/\//i.test(s)) return s;             // standalone build
  if (/^exp(\+[a-z0-9-]+)?:\/\//i.test(s)) return s; // Expo Go / dev client
  return APP_REDIRECT;
}

// ── 1. Microsoft login ───────────────────────────────────────────────────────
app.get('/auth/microsoft/start', (req, res) => {
  if (!MS_CLIENT_ID) return res.status(500).send('Server missing MS_CLIENT_ID');
  // The app tells us where to send the user back (its own deep link). We stash it
  // in `state` so we get it back on the callback. This makes it work in Expo Go
  // (an exp:// URL) and in a real build (brisk://) alike.
  const appRedirect = safeAppRedirect(req.query.app_redirect || APP_REDIRECT);
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
    // Re-validate on the way OUT too: `state` is attacker-forgeable base64.
    if (obj && typeof obj === 'object' && obj.r) return { appRedirect: safeAppRedirect(obj.r), claim: obj.c || '' };
  } catch (e) {}
  // Back-compat: older state was just base64(appRedirect).
  try { if (raw) return { appRedirect: safeAppRedirect(Buffer.from(raw, 'base64url').toString('utf8')), claim: '' }; } catch (e) {}
  return { appRedirect: APP_REDIRECT, claim: '' };
}

const htmlEscape = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function debugPage(ok, detail) {
  detail = htmlEscape(detail); // never reflect attacker-controlled error text raw
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
  // Refresh tokens grant full mailbox access — only persist them ENCRYPTED (and
  // only if a key is configured); otherwise keep them in memory for the 5-min TTL.
  writeSecure(path.join(HANDOFF_DIR, `${id}.enc`), entry);
  setTimeout(() => { handoffs.delete(id); try { fs.unlinkSync(path.join(HANDOFF_DIR, `${id}.enc`)); } catch (e) {} }, HANDOFF_TTL).unref?.();
  return id;
}
// Consume a handoff (single use): try memory, then encrypted disk. Returns entry or null.
function takeHandoff(rawId) {
  const id = path.basename(String(rawId || '')); // guard against path traversal
  let entry = handoffs.get(id);
  if (!entry && ENC_KEY) {
    const v = decStr((() => { try { return fs.readFileSync(path.join(HANDOFF_DIR, `${id}.enc`), 'utf8'); } catch (e) { return ''; } })());
    entry = v || null;
  }
  if (!entry) return null;
  handoffs.delete(id);
  try { fs.unlinkSync(path.join(HANDOFF_DIR, `${id}.enc`)); } catch (e) {}
  if (Date.now() - (entry.at || 0) > HANDOFF_TTL) return null;
  return entry;
}

// Flight recorder: last few callback attempts (no secrets) so we can debug remotely.
const recentCallbacks = [];
function record(entry) {
  recentCallbacks.unshift({ at: new Date().toISOString(), ...entry });
  recentCallbacks.length = Math.min(recentCallbacks.length, 12);
}
app.get('/debug/log', debugAuth, (_req, res) => res.json({ version: 'debug-47', recentCallbacks }));

// ── Live monitoring ──────────────────────────────────────────────────────────
// A snapshot of recent client-side events the app reports.
const clientEvents = [];
app.post('/debug/client-log', (req, res) => {
  const { level = 'info', event = '', detail = null, at } = req.body || {};
  clientEvents.unshift({ at: at || new Date().toISOString(), level, event: String(event).slice(0, 120), detail: detail ? String(JSON.stringify(detail)).slice(0, 500) : null });
  clientEvents.length = Math.min(clientEvents.length, 40);
  res.json({ ok: true });
});

app.get('/debug/status', debugAuth, (_req, res) => {
  res.json({
    version: 'debug-47',
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
app.get('/debug/dashboard', debugAuth, (_req, res) => {
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

// ── Google login (mirrors the Microsoft flow: handoff + claim) ───────────────
const googleRedirectUri = (req) => `${serverUrl(req)}/auth/google/callback`;

async function googleToken(extra) {
  const r = await fetch(GOOGLE_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, ...extra }),
  });
  const data = await r.json();
  if (!r.ok) { const err = new Error(data.error_description || data.error || 'google token failed'); err.detail = data; throw err; }
  return data;
}
async function googleAccessFromRefresh(refreshToken) {
  if (!refreshToken) throw new Error('not connected');
  const data = await googleToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return { accessToken: data.access_token };
}

app.get('/auth/google/start', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(500).send('Server missing GOOGLE_CLIENT_ID');
  const appRedirect = safeAppRedirect(req.query.app_redirect || APP_REDIRECT);
  const claim = String(req.query.claim || '');
  const state = Buffer.from(JSON.stringify({ r: appRedirect, c: claim })).toString('base64url');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: googleRedirectUri(req),
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',      // ask for a refresh token
    prompt: 'consent',           // force a refresh token every time
    include_granted_scopes: 'true',
    state,
  });
  res.redirect(`${GOOGLE_AUTH}?${params.toString()}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { appRedirect, claim } = decodeState(req);
  const sep = appRedirect.includes('?') ? '&' : '?';
  const { code, error } = req.query;
  if (error) { record({ stage: 'google_authorize_error', error: String(error) }); return res.redirect(`${appRedirect}${sep}error=${encodeURIComponent(String(error))}`); }
  if (!code) return res.redirect(`${appRedirect}${sep}error=missing_code`);
  try {
    const tokens = await googleToken({ grant_type: 'authorization_code', code: String(code), redirect_uri: googleRedirectUri(req) });
    if (!tokens.refresh_token) throw new Error('Google returned no refresh token. Remove the app at myaccount.google.com/permissions, then sign in again.');
    const session = makeHandoff(tokens.refresh_token, claim);
    record({ stage: 'google_token_success', sid: session, sidLen: session.length });
    return res.redirect(`${appRedirect}${sep}session=${encodeURIComponent(session)}&provider=google`);
  } catch (e) {
    record({ stage: 'google_token_error', message: e.message, detail: e.detail || null });
    return res.redirect(`${appRedirect}${sep}error=${encodeURIComponent(e.message)}`);
  }
});

// ── Gmail helpers ────────────────────────────────────────────────────────────
async function gmailGet(pathAndQuery, accessToken) {
  return fetch(`${GMAIL}${pathAndQuery}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}
function gmailHeader(payload, name) {
  const h = (payload?.headers || []).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}
function decodeB64Url(data = '') {
  return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
// Walk a Gmail payload tree, collecting the best html + text body.
function gmailExtractBody(payload) {
  let html = ''; let text = '';
  const walk = (part) => {
    if (!part) return;
    const mime = part.mimeType || '';
    if (mime === 'text/html' && part.body?.data) html += decodeB64Url(part.body.data);
    else if (mime === 'text/plain' && part.body?.data) text += decodeB64Url(part.body.data);
    (part.parts || []).forEach(walk);
  };
  walk(payload);
  return { html, text };
}
// Map our folder keys to a Gmail label id.
const GMAIL_LABEL = { inbox: 'INBOX', sentitems: 'SENT', drafts: 'DRAFT', archive: 'INBOX', junkemail: 'SPAM' };
function gmailLabelFor(fkey, folderId) {
  if (folderId) return folderId; // a real Gmail label id from /folders
  return GMAIL_LABEL[fkey] || 'INBOX';
}
// Fetch one Gmail page: list ids for a label, then load each message's metadata.
async function gmailInbox(accessToken, labelId, pageSize) {
  const listRes = await gmailGet(`/messages?maxResults=${pageSize}&labelIds=${encodeURIComponent(labelId)}`, accessToken);
  const list = await listRes.json();
  if (!listRes.ok) throw new Error(list.error?.message || 'Gmail list failed');
  const ids = (list.messages || []).map((m) => m.id);
  const metas = await Promise.all(ids.map(async (id) => {
    try {
      const r = await gmailGet(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, accessToken);
      const m = await r.json();
      if (!r.ok) return null;
      const labels = m.labelIds || [];
      const outgoing = labels.includes('SENT');
      const fromH = gmailHeader(m.payload, outgoing ? 'To' : 'From') || gmailHeader(m.payload, 'From');
      return {
        id: m.id,
        account: 'gmail',
        folder: labelId === 'INBOX' ? 'inbox' : labelId,
        from: fromH,
        subject: gmailHeader(m.payload, 'Subject') || '(no subject)',
        body: m.snippet || '',
        preview: m.snippet || '',
        date: m.internalDate ? new Date(parseInt(m.internalDate, 10)).toISOString() : new Date().toISOString(),
        read: !labels.includes('UNREAD'),
        flagged: labels.includes('STARRED'),
        inferred: labels.includes('CATEGORY_PROMOTIONS') || labels.includes('CATEGORY_SOCIAL') ? 'other' : null,
        threadKey: m.threadId || null,
      };
    } catch (e) { return null; }
  }));
  return metas.filter(Boolean);
}

// Exchange a code or refresh token for Microsoft access tokens.
async function msToken(extra) {
  const params = {
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    ...extra,
  };
  // Only request a specific scope set when first exchanging the auth code. On a
  // refresh grant we intentionally OMIT scope so Microsoft returns a token for
  // whatever the user already consented to — requesting MORE than was consented
  // (e.g. a newly-added Calendars scope) would fail with AADSTS65001 and break
  // mail for existing users. New/re-consented sign-ins pick up the wider set.
  if (extra?.grant_type !== 'refresh_token') params.scope = MS_SCOPES.join(' ');
  const body = new URLSearchParams(params);
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

const WELL_KNOWN_FOLDER = { inbox: 'inbox', sent: 'sentitems', drafts: 'drafts', archive: 'archive', junk: 'junkemail' };

// ── AI summary cache (id -> TL;DR), disk-backed ──────────────────────────────
// Summaries are attached to the inbox response so the cards show them
// immediately. Cache by Graph message id so a re-load never re-bills the AI.
const SUMMARY_CACHE_FILE = path.join(process.cwd(), 'summary-cache.json');
let summaryCache = readSecure(SUMMARY_CACHE_FILE); // encrypted at rest; {} if no key
// SECURITY: namespace every AI cache entry by a fingerprint of the email's own
// content (sender+subject), NOT the bare message id. iCloud ids are per-mailbox IMAP
// UIDs (tiny integers) that collide across accounts, so a bare-id cache would serve
// one user's private summary to another — and let anyone enumerate cached summaries
// by POSTing sequential ids. Content-fingerprinting makes keys unguessable and
// per-email, so a cache hit can only ever be the same email's own summary.
function cacheFp(a, b) { return crypto.createHash('sha256').update(`${a || ''} ${b || ''}`).digest('base64url').slice(0, 14); }
function sumKey(e) { return `${e.id}:${cacheFp(e.from, e.subject)}`; }

// ── Generic AI cache (key -> value) for per-email AI like next-steps / quick
// replies, so opening the same email again never re-bills the AI. Disk-backed.
const AUX_CACHE_FILE = path.join(process.cwd(), 'aux-cache.json');
let auxCache = readSecure(AUX_CACHE_FILE); // encrypted at rest; {} if no key
function auxGet(key) { return key ? auxCache[key] : undefined; }
function auxSet(key, value) {
  if (!key) return;
  auxCache[key] = value;
  const keys = Object.keys(auxCache);
  if (keys.length > 5000) for (const k of keys.slice(0, keys.length - 5000)) delete auxCache[k];
  writeSecure(AUX_CACHE_FILE, auxCache);
}

// ── Daily AI budget guard ────────────────────────────────────────────────────
// A hard ceiling on AI *generations* per day so a runaway loop or heavy day can't
// rack up a big bill. Cached results never count against it.
const DAILY_AI_CAP = parseInt(process.env.DAILY_AI_CAP || '400', 10);
// How many OLD emails the one-time "learn my inbox" may scan per day. Scanning is
// just free Graph metadata + a single cheap AI profiling call, so this is a volume
// guard, not a cost guard.
const LEARN_DAILY_CAP = parseInt(process.env.LEARN_DAILY_CAP || '5000', 10);
let learnDay = new Date().toISOString().slice(0, 10);
let learnCount = 0;
let aiDay = new Date().toISOString().slice(0, 10);
let aiDayCount = 0;
function underDailyBudget() {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== aiDay) { aiDay = d; aiDayCount = 0; }
  return aiDayCount < DAILY_AI_CAP;
}
function countAi(n = 1) { aiDayCount += n; }

let summaryCacheDirty = false;
function persistSummaryCache() {
  if (!summaryCacheDirty) return;
  writeSecure(SUMMARY_CACHE_FILE, summaryCache); summaryCacheDirty = false;
}
// Keep the cache from growing without bound (oldest-inserted dropped first).
function trimSummaryCache(max = 4000) {
  const keys = Object.keys(summaryCache);
  if (keys.length <= max) return;
  for (const k of keys.slice(0, keys.length - max)) delete summaryCache[k];
}
// Summarize whatever in `emails` isn't cached yet (bounded), then attach
// `aiSummary` to every email from the cache. Best-effort: never throws.
const INBOX_SUMMARY_CAP = parseInt(process.env.INBOX_SUMMARY_CAP || '30', 10);
async function attachSummaries(emails, { summarizeNew = true } = {}) {
  try {
    // Cost control: only spend AI on NEW summaries for the mail the user actually
    // sees (the first page). Deeper backlog pages still attach any cached summary
    // but don't generate new ones, so a full-mailbox sync can't drain the AI cap.
    const todo = summarizeNew
      ? emails.filter((e) => e.id && !summaryCache[sumKey(e)]).slice(0, INBOX_SUMMARY_CAP)
      : [];
    if (todo.length) {
      const got = await aiSummarize(todo.map((e) => ({ id: e.id, from: e.from, subject: e.subject, body: e.body })));
      let n = 0;
      for (const e of todo) { if (got[e.id] != null) { summaryCache[sumKey(e)] = got[e.id]; n += 1; } }
      if (n) {
        summaryCacheDirty = true;
        trimSummaryCache();
        persistSummaryCache();
        bumpUsage('summaries', n);
      }
    }
  } catch (e) { record({ stage: 'inbox_summary_error', message: e.message }); }
  for (const e of emails) { const v = summaryCache[sumKey(e)]; if (v) e.aiSummary = v; }
  return emails;
}

// ── 2. Mailbox fetch (Graph) ─────────────────────────────────────────────────
// Pulls one folder (Inbox by default; also Sent/Drafts/Archive), newest first.
// Fast + resilient: pages up to `limit`, but if a later page fails or times out
// it returns what it already has instead of failing the whole load. No AI here —
// fetching is FREE; summaries are a separate cached step (/summarize).
// Validate iCloud credentials (email + app-specific password) before linking.
app.post('/icloud/verify', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw new Error('Enter your iCloud email and app-specific password.');
    await icloudVerify(JSON.stringify({ email: String(email).trim(), password: String(password).trim() }));
    record({ stage: 'icloud_verify_ok' });
    res.json({ ok: true });
  } catch (e) {
    record({ stage: 'icloud_verify_error', message: e.message });
    res.status(400).json({ error: 'Could not sign in to iCloud. Check your email and app-specific password.' });
  }
});

app.post('/inbox', async (req, res) => {
  try {
    const { refreshToken, limit, folder, skip, folderId, provider } = req.body || {};

    // ── iCloud path (IMAP) ──────────────────────────────────────────────────
    if (provider === 'icloud') {
      const want = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const skipN = Math.max(parseInt(skip, 10) || 0, 0);
      const out = await icloudInbox(refreshToken, { limit: want, folder: String(folder || 'inbox').toLowerCase(), skip: skipN });
      record({ stage: 'inbox_ok', provider: 'icloud', count: out.emails.length });
      return res.json({ ...out, skip: skipN, refreshToken });
    }

    // ── Gmail path ──────────────────────────────────────────────────────────
    if (provider === 'google') {
      const want = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const skipN = Math.max(parseInt(skip, 10) || 0, 0);
      const fkey = WELL_KNOWN_FOLDER[String(folder || 'inbox').toLowerCase()] || 'inbox';
      // Gmail uses page tokens, not numeric skips — for now we serve the first
      // page only (deep background sync is Outlook-only), so a skip>0 is empty.
      if (skipN > 0) return res.json({ emails: [], skip: skipN, hasMore: false });
      const { accessToken } = await googleAccessFromRefresh(refreshToken);
      const labelId = gmailLabelFor(fkey, String(folderId || '').trim());
      const emails = await gmailInbox(accessToken, labelId, Math.min(want, 50));
      // Folder counts from the label.
      let unreadCount = null; let totalCount = null;
      try {
        const lr = await gmailGet(`/labels/${encodeURIComponent(labelId)}`, accessToken);
        const ld = await lr.json();
        if (lr.ok) { unreadCount = ld.messagesUnread ?? null; totalCount = ld.messagesTotal ?? null; }
      } catch (e) { /* counts are best-effort */ }
      const outgoingG = fkey === 'sentitems' || fkey === 'drafts';
      if (!outgoingG) { for (const e of emails) { const v = summaryCache[sumKey(e)]; if (v) e.aiSummary = v; } }
      record({ stage: 'gmail_inbox_ok', count: emails.length, label: labelId });
      return res.json({ emails, unreadCount, totalCount, skip: 0, hasMore: false });
    }

    const want = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 300);
    const skipN = Math.max(parseInt(skip, 10) || 0, 0);
    const fkey = WELL_KNOWN_FOLDER[String(folder || 'inbox').toLowerCase()] || 'inbox';
    // A specific Graph folder id (from /folders) overrides the well-known key, so
    // we can open any custom folder (Junk, Archive, "SCALE INVOICES", …).
    const fid = String(folderId || '').trim();
    const folderSeg = fid ? `mailFolders/${encodeURIComponent(fid)}` : `mailFolders/${fkey}`;
    const outgoing = !fid && (fkey === 'sentitems' || fkey === 'drafts');
    const { accessToken, refreshToken: newRt } = await accessTokenFromRefresh(refreshToken);

    // Folder totals (cheap) so the app can show the TRUE unread count even when
    // only some messages are loaded — matches what Outlook shows. Fire it off in
    // PARALLEL with the message fetch instead of waiting for it first.
    const countsPromise = graphGet(`${GRAPH}/me/${folderSeg}?$select=unreadItemCount,totalItemCount`, accessToken)
      .then((fr) => fr.json().then((fd) => (fr.ok ? { unreadCount: fd.unreadItemCount ?? null, totalCount: fd.totalItemCount ?? null } : {})))
      .catch(() => ({}));

    const pageSize = Math.min(want, 50); // Graph caps $top at 50 for messages
    let url =
      `${GRAPH}/me/${folderSeg}/messages?$top=${pageSize}&$skip=${skipN}` +
      `&$select=subject,from,toRecipients,bodyPreview,receivedDateTime,isRead,flag,inferenceClassification,conversationId` +
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
        folder: fid || fkey,
        from: party ? `${party.name || party.address} <${party.address}>` : (outgoing ? 'Me' : ''),
        subject: m.subject || '(no subject)',
        body: stripHtml(m.bodyPreview || ''),
        preview: stripHtml(m.bodyPreview || ''), // stable text for categorization
        date: m.receivedDateTime || new Date().toISOString(),
        read: !!m.isRead,
        flagged: m.flag?.flagStatus === 'flagged',
        inferred: m.inferenceClassification || null, // 'focused' | 'other'
        threadKey: m.conversationId || null,
      };
    });

    // Attach any cached AI TL;DRs INSTANTLY (no AI call here, so the inbox returns
    // fast). Generation is driven solely by the client's /summarize call so each
    // message is summarized exactly once — no server/client race that would make
    // the text flicker.
    if (!outgoing) { for (const e of emails) { const v = summaryCache[sumKey(e)]; if (v) e.aiSummary = v; } }

    const { unreadCount = null, totalCount = null } = await countsPromise;

    record({ stage: 'inbox_success', folder: fkey, count: emails.length, skip: skipN, unread: unreadCount });
    res.json({ emails, refreshToken: newRt, unreadCount, totalCount, skip: skipN, hasMore: emails.length >= pageSize });
  } catch (e) {
    record({ stage: 'inbox_error', message: e.message, detail: e.detail || null });
    res.status(400).json({ error: e.message });
  }
});

// List the mailbox's folders (with unread/total counts) for the Outlook-style
// drawer. Returns top-level folders, each with any child folders, plus the
// account's email address. Well-known folders are tagged so the app can order
// and icon them (Inbox, Sent, Drafts, Deleted, Archive, Junk).
const FOLDER_KIND = {
  inbox: 'inbox', sentitems: 'sent', drafts: 'drafts', deleteditems: 'deleted',
  archive: 'archive', junkemail: 'junk', outbox: 'outbox',
};
app.post('/folders', async (req, res) => {
  try {
    const { refreshToken, provider } = req.body || {};

    // ── iCloud path (IMAP folders) ───────────────────────────────────────────
    if (provider === 'icloud') {
      const out = await icloudFolders(refreshToken);
      return res.json({ ...out, refreshToken });
    }

    // ── Gmail path: labels become folders ────────────────────────────────────
    if (provider === 'google') {
      const { accessToken } = await googleAccessFromRefresh(refreshToken);
      let email = null;
      try {
        const pr = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
        const pd = await pr.json(); if (pr.ok) email = pd.email || null;
      } catch (e) { /* best-effort */ }
      const lr = await gmailGet('/labels', accessToken);
      const ld = await lr.json();
      if (!lr.ok) throw new Error(ld.error?.message || 'labels fetch failed');
      const SYS = { INBOX: { name: 'Inbox', kind: 'inbox' }, SENT: { name: 'Sent', kind: 'sent' }, DRAFT: { name: 'Drafts', kind: 'drafts' }, STARRED: { name: 'Starred', kind: null }, SPAM: { name: 'Spam', kind: 'junk' }, TRASH: { name: 'Trash', kind: 'deleted' }, IMPORTANT: { name: 'Important', kind: null } };
      const order = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'IMPORTANT', 'SPAM', 'TRASH'];
      const folders = [];
      const byId = {};
      for (const l of (ld.labels || [])) byId[l.id] = l;
      const pushLabel = async (l, name, kind) => {
        let unread = 0; let total = 0;
        try { const r = await gmailGet(`/labels/${encodeURIComponent(l.id)}`, accessToken); const d = await r.json(); if (r.ok) { unread = d.messagesUnread || 0; total = d.messagesTotal || 0; } } catch (e) {}
        folders.push({ id: l.id, name, kind, unread, total, childCount: 0, children: [] });
      };
      for (const sid of order) { if (byId[sid]) await pushLabel(byId[sid], SYS[sid].name, SYS[sid].kind); }
      // User-created labels (skip Gmail's CATEGORY_*/system noise).
      for (const l of (ld.labels || [])) {
        if (l.type === 'user') await pushLabel(l, l.name, null);
      }
      record({ stage: 'gmail_folders_ok', count: folders.length });
      return res.json({ email, displayName: email, folders });
    }

    const { accessToken, refreshToken: newRt } = await accessTokenFromRefresh(refreshToken);

    // Who is this? (shown in the drawer header)
    let email = null; let displayName = null;
    try {
      const me = await graphGet(`${GRAPH}/me?$select=mail,userPrincipalName,displayName`, accessToken);
      const md = await me.json();
      if (me.ok) { email = md.mail || md.userPrincipalName || null; displayName = md.displayName || null; }
    } catch (e) { /* best-effort */ }

    const select = '$select=id,displayName,unreadItemCount,totalItemCount,childFolderCount,wellKnownName';
    const top = await graphGet(`${GRAPH}/me/mailFolders?${select}&$top=60`, accessToken);
    const td = await top.json();
    if (!top.ok) throw new Error(td.error?.message || 'folders fetch failed');

    const mapFolder = (f) => ({
      id: f.id,
      name: f.displayName,
      kind: FOLDER_KIND[String(f.wellKnownName || '').toLowerCase()] || null,
      unread: f.unreadItemCount ?? 0,
      total: f.totalItemCount ?? 0,
      childCount: f.childFolderCount ?? 0,
    });

    const folders = [];
    for (const f of (td.value || [])) {
      const folder = mapFolder(f);
      folder.children = [];
      // Pull one level of children for folders that have them (e.g. custom trees).
      if (folder.childCount > 0) {
        try {
          const ch = await graphGet(`${GRAPH}/me/mailFolders/${f.id}/childFolders?${select}&$top=40`, accessToken);
          const cd = await ch.json();
          if (ch.ok) folder.children = (cd.value || []).map(mapFolder);
        } catch (e) { /* skip children on error */ }
      }
      folders.push(folder);
    }

    record({ stage: 'folders_ok', count: folders.length });
    res.json({ email, displayName, folders, refreshToken: newRt });
  } catch (e) {
    record({ stage: 'folders_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// Split a raw header ("A <a@x>, B <b@y>") into ["A <a@x>", "B <b@y>"] for display.
function splitAddrs(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

// Graph recipient arrays → ["Name <email>"] for the reader's To/Cc display.
function graphParties(list) {
  return (list || [])
    .map((r) => r?.emailAddress)
    .filter(Boolean)
    .map((a) => (a.name && a.name !== a.address ? `${a.name} <${a.address || ''}>` : (a.address || a.name || '')))
    .filter(Boolean);
}

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
  // Cap the input first: the URL patterns below can backtrack badly on a hostile
  // body that's one giant unbroken token, which would block the event loop. A real
  // meeting link is near the top of the message anyway.
  s = String(s).slice(0, 20000);
  // Decode HTML entities and (a copy of) percent-encoding so links that are wrapped
  // in a redirect (e.g. Google Calendar invites: google.com/url?q=https%3A%2F%2Fzoom…)
  // or HTML-escaped still resolve to a clean, openable URL.
  let text = String(s)
    .replace(/&amp;/gi, '&').replace(/&#0?38;/g, '&').replace(/&#0?61;/g, '=').replace(/&#0?47;/g, '/').replace(/&quot;/gi, '"');
  try { text += '\n' + decodeURIComponent(text.replace(/%(?![0-9a-fA-F]{2})/g, '%25')); } catch (e) { /* leave as-is */ }
  const patterns = [
    // Require the real meeting path (/j/ /w/ /s/ /my/) so we never grab a Zoom
    // logo/footer/branding link (which gives "Invalid meeting ID").
    { provider: 'Zoom', re: /https?:\/\/[\w.-]*zoom\.us\/(?:j|w|s|my)\/[^\s"'<>)\]]+/i },
    { provider: 'Microsoft Teams', re: /https?:\/\/teams\.(?:microsoft|live)\.com\/l\/meetup[^\s"'<>)\]]+/i },
    { provider: 'Google Meet', re: /https?:\/\/meet\.google\.com\/[a-z]{2,}[^\s"'<>)\]]*/i },
    { provider: 'Webex', re: /https?:\/\/[\w.-]*webex\.com\/[^\s"'<>)\]]*j\.php[^\s"'<>)\]]+/i },
  ];
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) {
      // Strip trailing punctuation/HTML the URL may have swallowed.
      const url = m[0].replace(/&amp;/gi, '&').replace(/(&quot;|&gt;|&lt;).*$/i, '').replace(/[)\].,;:'">]+$/, '');
      return { provider: p.provider, url };
    }
  }
  return null;
}

// Fetch the full body of one message (on demand, when an email is opened).
app.post('/message', async (req, res) => {
  try {
    const { refreshToken, id, provider, folder } = req.body || {};
    if (!id) throw new Error('missing id');

    // ── iCloud path (IMAP) ──────────────────────────────────────────────────
    if (provider === 'icloud') {
      const out = await icloudMessage(refreshToken, id, String(folder || 'inbox').toLowerCase());
      record({ stage: 'message_ok', provider: 'icloud', htmlLen: (out.bodyHtml || '').length, atts: (out.attachments || []).length });
      return res.json(out);
    }

    // ── Gmail path ──────────────────────────────────────────────────────────
    if (provider === 'google') {
      const { accessToken } = await googleAccessFromRefresh(refreshToken);
      const r = await gmailGet(`/messages/${id}?format=full`, accessToken);
      const m = await r.json();
      if (!r.ok) throw new Error(m.error?.message || 'fetch failed');
      const { html, text } = gmailExtractBody(m.payload);
      const plain = text || stripHtml(html) || m.snippet || '';
      const attachments = [];
      const walkA = (part) => {
        if (!part) return;
        if (part.filename && part.body?.attachmentId) {
          attachments.push({ id: part.body.attachmentId, name: part.filename, size: part.body.size || 0, contentType: part.mimeType || '' });
        }
        (part.parts || []).forEach(walkA);
      };
      walkA(m.payload);
      return res.json({
        body: plain,
        bodyHtml: html ? sanitizeHtml(html) : '',
        meeting: detectMeeting(`${html} ${plain}`),
        invite: null,
        attachments,
      });
    }

    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    // NOTE: meetingMessageType lives on the eventMessage subtype, not the base
    // Message — selecting it here errors ("no property named meetingMessageType")
    // and takes the whole body with it. Fetch the body plainly; detect invites in
    // a separate best-effort cast query below.
    const r = await fetch(`${GRAPH}/me/messages/${id}?$select=subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,hasAttachments`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const m = await r.json();
    if (!r.ok) throw new Error(m.error?.message || 'fetch failed');
    // Graph's contentType can be "html"/"HTML"/"Html" — compare case-insensitively,
    // and also treat content that clearly contains tags as HTML. This is what was
    // dropping the rich body (logos, buttons, tables, links) to plain text.
    const content = m.body?.content || '';
    const isHtml = String(m.body?.contentType || '').toLowerCase() === 'html' || /<\s*(html|body|div|table|p|a|img|br|span|h[1-6])\b/i.test(content);
    const rawHtml = isHtml ? content : '';
    const text = stripHtml(content || m.bodyPreview || '');

    // Real (non-inline) attachments, shown as chips in the reader.
    let attachments = [];
    if (m.hasAttachments) {
      try {
        const ar = await fetch(`${GRAPH}/me/messages/${id}/attachments?$select=id,name,size,contentType,isInline`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const ad = await ar.json();
        if (ar.ok) attachments = (ad.value || []).filter((a) => !a.isInline && a.name).map((a) => ({ id: a.id, name: a.name, size: a.size || 0, contentType: a.contentType || '' }));
      } catch (e) { /* attachments are best-effort */ }
    }

    // If this email is a meeting invite, look up the linked calendar event so the
    // app can show Accept / Maybe / Decline inline. We query the eventMessage cast
    // directly — it 400s for ordinary mail, which we swallow. Best-effort, never fatal.
    let invite = null;
    try {
      const er = await fetch(
        `${GRAPH}/me/messages/${id}/microsoft.graph.eventMessage?$select=meetingMessageType&$expand=event($select=id,responseStatus,isOrganizer)`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (er.ok) {
        const ed = await er.json();
        const ev = ed?.event;
        if (ed?.meetingMessageType && ed.meetingMessageType !== 'none' && ev?.id) {
          invite = {
            eventId: ev.id,
            response: ev.responseStatus?.response || 'notResponded',
            isOrganizer: !!ev.isOrganizer,
            type: ed.meetingMessageType,
          };
        }
      }
    } catch (e) { /* not an invite, or no event — just skip RSVP */ }

    const outHtml = rawHtml ? sanitizeHtml(rawHtml) : '';
    record({ stage: 'message_ok', isHtml, htmlLen: outHtml.length, textLen: text.length, atts: attachments.length });
    res.json({
      body: text,
      bodyHtml: outHtml,
      to: graphParties(m.toRecipients),
      cc: graphParties(m.ccRecipients),
      meeting: detectMeeting(`${content} ${text}`),
      invite,
      attachments,
    });
  } catch (e) {
    record({ stage: 'message_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// Download one attachment's bytes as a data URI (for opening/sharing in the app).
app.post('/attachment', async (req, res) => {
  try {
    const { refreshToken, id, attachmentId, provider, folder } = req.body || {};
    if (!id || attachmentId == null) throw new Error('missing id or attachmentId');
    if (provider === 'icloud') {
      const out = await icloudAttachment(refreshToken, id, attachmentId, String(folder || 'inbox').toLowerCase());
      return res.json(out);
    }
    if (provider === 'google') {
      const { accessToken } = await googleAccessFromRefresh(refreshToken);
      const r = await gmailGet(`/messages/${id}/attachments/${attachmentId}`, accessToken);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'attachment fetch failed');
      const b64 = String(d.data || '').replace(/-/g, '+').replace(/_/g, '/');
      return res.json({ base64: b64 });
    }
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const r = await fetch(`${GRAPH}/me/messages/${id}/attachments/${attachmentId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'attachment fetch failed');
    res.json({ base64: d.contentBytes || '', contentType: d.contentType || '' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// All messages in a conversation/thread (for the thread view). Returns
// { messages: [{ id, from, date, read, bodyHtml, body }] } oldest → newest.
app.post('/thread', async (req, res) => {
  try {
    const { refreshToken, threadKey, provider } = req.body || {};
    if (!threadKey) throw new Error('missing threadKey');

    if (provider === 'google') {
      const { accessToken } = await googleAccessFromRefresh(refreshToken);
      const r = await gmailGet(`/threads/${encodeURIComponent(threadKey)}?format=full`, accessToken);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'thread fetch failed');
      const messages = (d.messages || []).map((m) => {
        const { html, text } = gmailExtractBody(m.payload);
        const labels = m.labelIds || [];
        return {
          id: m.id,
          from: gmailHeader(m.payload, 'From'),
          to: splitAddrs(gmailHeader(m.payload, 'To')),
          cc: splitAddrs(gmailHeader(m.payload, 'Cc')),
          subject: gmailHeader(m.payload, 'Subject'),
          date: m.internalDate ? new Date(parseInt(m.internalDate, 10)).toISOString() : null,
          read: !labels.includes('UNREAD'),
          bodyHtml: html ? sanitizeHtml(html) : '',
          body: text || stripHtml(html) || m.snippet || '',
        };
      });
      return res.json({ messages });
    }

    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    // Graph rejects $filter on conversationId combined with $orderby ("restriction
    // or sort order is too complex"), so we drop $orderby and sort in JS below.
    const url = `${GRAPH}/me/messages?$filter=${encodeURIComponent(`conversationId eq '${threadKey}'`)}` +
      `&$select=subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,isRead&$top=30`;
    const r = await graphGet(url, accessToken);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'thread fetch failed');
    const messages = (d.value || []).map((m) => {
      const c = m.body?.content || '';
      const isHtml = String(m.body?.contentType || '').toLowerCase() === 'html' || /<\s*(html|body|div|table|p|a|img|br|span|h[1-6])\b/i.test(c);
      const rawHtml = isHtml ? c : '';
      const text = stripHtml(c || m.bodyPreview || '');
      return {
        id: m.id,
        from: m.from?.emailAddress ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>` : '',
        to: graphParties(m.toRecipients),
        cc: graphParties(m.ccRecipients),
        subject: m.subject || '',
        date: m.receivedDateTime || null,
        read: !!m.isRead,
        bodyHtml: rawHtml ? sanitizeHtml(rawHtml) : '',
        body: text,
      };
    });
    messages.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)); // oldest → newest
    res.json({ messages });
  } catch (e) {
    record({ stage: 'thread_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// Persist a mailbox action from a swipe/button: read | unread | archive | trash.
// Best-effort — the app already updates its own view optimistically.
app.post('/action', async (req, res) => {
  try {
    const { refreshToken, id, action, provider, folder } = req.body || {};
    if (!id || !action) throw new Error('missing id or action');

    if (provider === 'icloud') {
      await icloudAction(refreshToken, id, action, String(folder || 'inbox').toLowerCase());
      return res.json({ ok: true });
    }

    if (provider === 'google') {
      const { accessToken } = await googleAccessFromRefresh(refreshToken);
      const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
      if (action === 'trash') {
        const r = await fetch(`${GMAIL}/messages/${id}/trash`, { method: 'POST', headers: auth });
        if (!r.ok) throw new Error('Gmail trash failed');
      } else if (action === 'inbox') {
        // Restore: a trashed message keeps the TRASH label even if you add INBOX, so
        // it stays hidden and is auto-deleted after 30 days. Untrash first (harmless
        // if it wasn't trashed), then ensure it's back in the inbox and out of spam.
        await fetch(`${GMAIL}/messages/${id}/untrash`, { method: 'POST', headers: auth }).catch(() => {});
        const r = await fetch(`${GMAIL}/messages/${id}/modify`, { method: 'POST', headers: auth, body: JSON.stringify({ addLabelIds: ['INBOX'], removeLabelIds: ['SPAM'] }) });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error?.message || 'Gmail restore failed'); }
      } else {
        const body = {
          read: { removeLabelIds: ['UNREAD'] },
          unread: { addLabelIds: ['UNREAD'] },
          archive: { removeLabelIds: ['INBOX'] },
          junk: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
        }[action];
        if (!body) throw new Error(`unknown action ${action}`);
        const r = await fetch(`${GMAIL}/messages/${id}/modify`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error?.message || 'Gmail modify failed'); }
      }
      return res.json({ ok: true });
    }

    // Outlook (Graph)
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    let r;
    if (action === 'read' || action === 'unread') {
      r = await fetch(`${GRAPH}/me/messages/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ isRead: action === 'read' }) });
    } else if (action === 'archive' || action === 'trash' || action === 'junk' || action === 'inbox') {
      const destinationId = action === 'trash' ? 'deleteditems' : action === 'junk' ? 'junkemail' : action === 'inbox' ? 'inbox' : 'archive';
      r = await fetch(`${GRAPH}/me/messages/${id}/move`, { method: 'POST', headers: auth, body: JSON.stringify({ destinationId }) });
    } else {
      throw new Error(`unknown action ${action}`);
    }
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error?.message || 'action failed'); }
    res.json({ ok: true });
  } catch (e) {
    record({ stage: 'action_error', message: e.message });
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
// Filler words to drop so a natural-language request ("show me all the emails
// from Brianna about the contract") becomes useful search terms ("Brianna contract").
const ASK_STOP = new Set(['all', 'emails', 'email', 'mail', 'message', 'messages', 'in', 'from', 'the', 'show', 'find', 'pull', 'search', 'look', 'looking', 'get', 'me', 'my', 'about', 'regarding', 're', 'any', 'please', 'that', 'those', 'these', 'they', 'them', 'are', 'was', 'were', 'is', 'be', 'been', 'for', 'of', 'to', 'a', 'an', 'and', 'or', 'with', 'this', 'give', 'list', 'everything', 'every', 'where', 'what', 'which', 'who', 'when', 'did', 'do', 'does', 'have', 'has', 'had', 'sent', 'received', 'i', 'we', 'you']);
function askTerms(query) {
  return query.split(/\s+/).map((w) => w.replace(/[^\w@.'-]/g, '')).filter((w) => w.length > 1 && !ASK_STOP.has(w.toLowerCase()));
}

// Search Outlook (Graph) for candidate emails. Runs a phrase search AND a broad
// OR-of-terms search, then merges — much better recall than a single strict phrase.
async function askSearchOutlook(accessToken, query, terms) {
  const SELECT = 'subject,from,toRecipients,bodyPreview,receivedDateTime,isRead,flag,inferenceClassification';
  const map = (m) => ({
    id: m.id, account: 'outlook',
    from: m.from?.emailAddress ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>` : '',
    subject: m.subject || '(no subject)',
    body: stripHtml(m.bodyPreview || ''), preview: stripHtml(m.bodyPreview || ''),
    date: m.receivedDateTime || new Date().toISOString(),
    read: !!m.isRead, flagged: m.flag?.flagStatus === 'flagged', inferred: m.inferenceClassification || null,
  });
  const byId = new Map();
  const run = async (searchExpr) => {
    try {
      const url = `${GRAPH}/me/messages?$search=${encodeURIComponent(searchExpr)}&$top=25&$select=${SELECT}`;
      const r = await graphGet(url, accessToken);
      const d = await r.json();
      if (r.ok) (d.value || []).map(map).forEach((e) => { if (!byId.has(e.id)) byId.set(e.id, e); });
    } catch (e) { /* best-effort */ }
  };
  if (terms.length) {
    await run(`"${query.trim()}"`);                                  // exact phrase (highest precision)
    await run(terms.map((t) => `"${t}"`).join(' OR '));              // any term (highest recall)
  }
  return { candidates: [...byId.values()], searched: terms.length > 0 };
}

// Search Gmail for candidate emails using its native query syntax.
async function askSearchGmail(accessToken, terms) {
  if (!terms.length) return { candidates: [], searched: false };
  const q = terms.join(' OR ');
  const listRes = await gmailGet(`/messages?maxResults=25&q=${encodeURIComponent(q)}`, accessToken);
  const list = await listRes.json();
  if (!listRes.ok) throw new Error(list.error?.message || 'Gmail search failed');
  const ids = (list.messages || []).map((m) => m.id);
  const candidates = (await Promise.all(ids.map(async (id) => {
    try {
      const r = await gmailGet(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, accessToken);
      const m = await r.json();
      if (!r.ok) return null;
      return {
        id, account: 'google',
        from: gmailHeader(m.payload, 'From') || '',
        subject: gmailHeader(m.payload, 'Subject') || '(no subject)',
        body: m.snippet || '', preview: m.snippet || '',
        date: new Date(Number(m.internalDate) || Date.now()).toISOString(),
        read: !(m.labelIds || []).includes('UNREAD'), flagged: (m.labelIds || []).includes('STARRED'),
      };
    } catch (e) { return null; }
  }))).filter(Boolean);
  return { candidates, searched: true };
}

app.post('/ask', async (req, res) => {
  try {
    const { refreshToken, q } = req.body || {};
    const provider = String(req.body?.provider || 'outlook').toLowerCase();
    const query = String(q || '').trim();
    if (!query) return res.json({ answer: '', emails: [] });
    if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: 'AI not configured (set ANTHROPIC_API_KEY).' });
    if (provider === 'icloud') {
      return res.json({ answer: 'AI search isn’t available for iCloud accounts yet. Use the search box to find mail by keyword.', emails: [] });
    }

    const terms = askTerms(query);
    let candidates = [];
    let searched = false;
    if (provider === 'google') {
      const acc = await googleAccessFromRefresh(refreshToken);
      ({ candidates, searched } = await askSearchGmail(acc.accessToken, terms));
    } else {
      const { accessToken } = await accessTokenFromRefresh(refreshToken);
      ({ candidates, searched } = await askSearchOutlook(accessToken, query, terms));
    }

    if (!candidates.length) {
      const answer = searched
        ? `I couldn't find any emails matching "${query}".`
        : `Tell me what to look for (a sender, company, or topic) and I'll find it.`;
      record({ stage: 'ask_ok', provider, matched: 0, picked: 0 });
      return res.json({ answer, emails: [] });
    }

    const items = candidates.map((e) => ({ id: e.id, from: e.from, subject: e.subject, date: e.date, preview: (e.body || '').slice(0, 240) }));
    const msg = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 900,
      system:
        'You help the user find and understand emails. You are given their request and a JSON ' +
        'list of candidate emails (id, from, subject, date, preview) returned by a keyword search. ' +
        'The search casts a WIDE net, so some candidates will be irrelevant — your job is to keep ' +
        'ONLY the emails that genuinely match what the user asked for (by sender, topic, and content), ' +
        'and drop the rest. Be strict: it is better to return fewer, correct emails than to include ' +
        'unrelated ones. If NONE of the candidates truly match, return an empty ids list and say so. ' +
        'Order the ids from most to least relevant. Reply ONLY JSON (no code fences): ' +
        '{"answer":"1-3 sentence answer","ids":["id",...]}.',
      messages: [{ role: 'user', content: `Request: ${query}\n\nCandidate emails:\n${JSON.stringify(items)}` }],
    });
    let text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const order = (parsed.ids || []).filter((id) => candidates.some((e) => e.id === id));
    // Keep the AI's chosen order and DROP anything it didn't pick — that's what stops
    // unrelated emails from showing up. If it picked nothing, return no emails.
    const byId = new Map(candidates.map((e) => [e.id, e]));
    const picked = order.map((id) => byId.get(id)).filter(Boolean);
    bumpUsage('asks');
    record({ stage: 'ask_ok', provider, matched: candidates.length, picked: picked.length });
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
    // Skip anything we've already cached server-side (the inbox attaches those),
    // so we never re-bill and only summarize genuinely new mail.
    const fresh = items.filter((i) => i.id && !summaryCache[sumKey(i)]);
    // Daily budget guard: if we've hit the cap, only return what's cached.
    const summaries = (fresh.length && underDailyBudget())
      ? await aiSummarize(fresh.map((i) => ({ id: i.id, from: i.from, subject: i.subject, body: i.preview || i.body || '' })))
      : {};
    let n = 0;
    for (const i of fresh) { if (summaries[i.id] != null) { summaryCache[sumKey(i)] = summaries[i.id]; n += 1; } }
    if (n) {
      summaryCacheDirty = true;
      trimSummaryCache();
      persistSummaryCache();
      bumpUsage('summaries', n);
      countAi(n);
    }
    // Return cached ones (keyed by the client's own id) for everything it asked.
    const out = {};
    for (const i of items) { const v = summaryCache[sumKey(i)]; if (v) out[i.id] = v; }
    record({ stage: 'summarize_ok', count: n, ms: Date.now() - started });
    res.json({ summaries: out });
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

// ── 4e. Snooze time suggestion ───────────────────────────────────────────────
app.post('/snooze-suggest', async (req, res) => {
  try {
    const { subject, body, now } = req.body || {};
    if (!ANTHROPIC_API_KEY) return res.json({ suggestion: null });
    const msg = await anthropic().messages.create({
      model: AI_MODEL, max_tokens: 160,
      system:
        'Given an email and the current datetime, suggest the single best FUTURE time to ' +
        'resurface (snooze) it, based on any date/deadline/meeting it mentions. Reply ONLY ' +
        'JSON {"label":"short human label","iso":"ISO-8601 future datetime"}. If there is no ' +
        'time cue, suggest tomorrow at 8am.',
      messages: [{ role: 'user', content: `Now: ${now || new Date().toISOString()}\nSubject: ${subject || ''}\n\n${String(body || '').slice(0, 1200)}` }],
    });
    let text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    res.json({ suggestion: parsed });
  } catch (e) {
    res.json({ suggestion: null });
  }
});

// ── 4f. Relationship intelligence (sender mini-profile) ──────────────────────
app.post('/relationship', async (req, res) => {
  try {
    const { refreshToken, email } = req.body || {};
    if (!email) throw new Error('missing email');
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const q = encodeURIComponent(`"${email}"`);
    const r = await graphGet(`${GRAPH}/me/messages?$search=${q}&$select=from,receivedDateTime,isRead&$top=50`, accessToken);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'lookup failed');
    const msgs = data.value || [];
    const low = String(email).toLowerCase();
    let received = 0; let sent = 0; let awaiting = 0; let last = null;
    for (const m of msgs) {
      const fromThem = (m.from?.emailAddress?.address || '').toLowerCase().includes(low);
      if (fromThem) { received += 1; if (!m.isRead) awaiting += 1; } else sent += 1;
      const d = m.receivedDateTime ? new Date(m.receivedDateTime) : null;
      if (d && (!last || d > last)) last = d;
    }
    res.json({ total: msgs.length, received, sent, awaiting, lastIso: last ? last.toISOString() : null });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── One-time "learn my inbox" ────────────────────────────────────────────────
// Two cheap steps the CLIENT drives so it can show a real progress bar:
//   /learn/scan    — pages through old emails' METADATA (free Graph), returning a
//                    batch of sender counts + a cursor. No AI. Effectively uncapped
//                    since Graph metadata costs nothing.
//   /learn/profile — ONE cheap AI call over the aggregated top senders to suggest
//                    VIP contacts + a short profile. Deliberately never summarizes
//                    every email.
app.post('/learn/scan', async (req, res) => {
  try {
    const { refreshToken, provider, cursor } = req.body || {};
    const deadline = Date.now() + 9000; // ~9s per call; the client loops for progress
    const senders = {}; const subjects = [];
    let processed = 0;
    const note = (addr, name, subject) => {
      if (addr) { const k = String(addr).toLowerCase(); senders[k] = senders[k] || { name: name || k, count: 0 }; senders[k].count += 1; }
      if (subjects.length < 30 && subject) subjects.push(String(subject).slice(0, 100));
      processed += 1;
    };
    let nextCursor = null;

    if (provider === 'google') {
      const { accessToken } = await googleAccessFromRefresh(refreshToken);
      let pageToken = cursor || '';
      while (Date.now() < deadline) {
        const lr = await gmailGet(`/messages?maxResults=100&labelIds=INBOX${pageToken ? `&pageToken=${pageToken}` : ''}`, accessToken);
        const ld = await lr.json();
        if (!lr.ok) { pageToken = ''; break; }
        const ids = (ld.messages || []).map((m) => m.id);
        const metas = await Promise.all(ids.map(async (id) => {
          try { const r = await gmailGet(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, accessToken); const m = await r.json(); return r.ok ? m : null; } catch (e) { return null; }
        }));
        for (const m of metas) {
          if (!m) continue;
          const from = gmailHeader(m.payload, 'From');
          const email = (from.match(/[^\s<>]+@[^\s<>]+/) || [''])[0];
          note(email, from.replace(/<[^>]+>/, '').replace(/"/g, '').trim(), gmailHeader(m.payload, 'Subject'));
        }
        pageToken = ld.nextPageToken || '';
        if (!pageToken) break;
      }
      nextCursor = pageToken || null;
    } else {
      const { accessToken } = await accessTokenFromRefresh(refreshToken);
      let url = cursor || `${GRAPH}/me/messages?$top=100&$select=from,subject,receivedDateTime&$orderby=receivedDateTime desc`;
      while (url && Date.now() < deadline) {
        const r = await graphGet(url, accessToken);
        const d = await r.json();
        if (!r.ok) { url = null; break; }
        for (const m of (d.value || [])) { const a = m.from?.emailAddress; note(a?.address, a?.name, m.subject); }
        url = d['@odata.nextLink'] || null;
      }
      nextCursor = url || null;
    }
    res.json({ senders, subjects, processed, cursor: nextCursor, done: !nextCursor });
  } catch (e) {
    record({ stage: 'learn_scan_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

app.post('/learn/profile', async (req, res) => {
  try {
    const { topSenders, sampleSubjects } = req.body || {};
    if (!ANTHROPIC_API_KEY || !Array.isArray(topSenders) || !topSenders.length) return res.json({ suggestedVips: [], profile: '' });
    if (!underDailyBudget()) return res.json({ suggestedVips: [], profile: '', budget: true });
    const msg = await anthropic().messages.create({
      model: AI_MODEL, max_tokens: 700,
      system:
        'You are profiling a user from their email metadata. Given their most frequent ' +
        'senders (with counts) and some subject lines, do two things: (1) pick up to 8 ' +
        'people who are likely IMPORTANT human contacts worth marking VIP (real colleagues/' +
        'clients/partners — NOT newsletters, no-reply, marketing, or automated senders); ' +
        '(2) write a 1-2 sentence profile of the user (their work/role, key relationships, ' +
        'recurring topics). Reply ONLY JSON: {"vips":[{"email","name","reason"}],"profile":"..."}.',
      messages: [{ role: 'user', content: JSON.stringify({ topSenders: topSenders.slice(0, 80), sampleSubjects: (sampleSubjects || []).slice(0, 40) }) }],
    });
    let t = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    t = t.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    const suggestedVips = (parsed.vips || []).filter((v) => v && v.email && String(v.email).includes('@')).slice(0, 8)
      .map((v) => ({ email: String(v.email).toLowerCase(), name: String(v.name || ''), reason: String(v.reason || '') }));
    const profile = String(parsed.profile || '');
    bumpUsage('asks'); countAi();
    auxSet('profile', { profile, suggestedVips, at: Date.now() });
    record({ stage: 'learn_profile_ok', vips: suggestedVips.length });
    res.json({ suggestedVips, profile });
  } catch (e) {
    record({ stage: 'learn_profile_error', message: e.message });
    res.json({ suggestedVips: [], profile: '' });
  }
});

// ── 4f-2. Calendar: upcoming events + RSVP (Outlook calendar via Graph) ───────
// Lists events in a window so the app can show what's coming up and let the user
// accept/decline meeting invites — exactly what they'd do in Outlook itself.
app.post('/calendar/upcoming', async (req, res) => {
  try {
    const { refreshToken, days, provider } = req.body || {};
    const span = Math.min(Math.max(parseInt(days, 10) || 14, 1), 60);
    const now = new Date();
    const end = new Date(now.getTime() + span * 86400000);

    if (provider === 'icloud') {
      try {
        const events = await icloudCalendar(refreshToken, { start: now, end });
        record({ stage: 'calendar_ok', provider: 'icloud', count: events.length });
        return res.json({ events });
      } catch (e) {
        record({ stage: 'calendar_error', provider: 'icloud', message: e.message });
        return res.json({ events: [], needsReconnect: true });
      }
    }

    if (provider === 'google') {
      let accessToken;
      try { ({ accessToken } = await googleAccessFromRefresh(refreshToken)); }
      catch (e) { return res.json({ events: [], needsReconnect: true }); }
      const url = `${GCAL}/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50` +
        `&timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await r.json();
      // 403 = token predates the calendar scope → reconnect to grant it.
      if (r.status === 403) return res.json({ events: [], needsReconnect: true });
      if (!r.ok) throw new Error(data.error?.message || 'calendar fetch failed');
      const events = (data.items || []).map((e) => {
        const self = (e.attendees || []).find((a) => a.self);
        const video = (e.conferenceData?.entryPoints || []).find((p) => p.entryPointType === 'video');
        const respMap = { accepted: 'accepted', declined: 'declined', tentative: 'tentativelyAccepted', needsAction: 'notResponded' };
        return {
          id: e.id,
          subject: e.summary || '(no title)',
          start: e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00Z` : null),
          end: e.end?.dateTime || (e.end?.date ? `${e.end.date}T00:00:00Z` : null),
          allDay: !e.start?.dateTime && !!e.start?.date,
          location: e.location || '',
          organizer: e.organizer?.displayName || e.organizer?.email || '',
          isOrganizer: !!e.organizer?.self,
          joinUrl: e.hangoutLink || video?.uri || null,
          response: e.organizer?.self ? 'organizer' : (self ? (respMap[self.responseStatus] || 'notResponded') : 'none'),
          attendeeCount: Array.isArray(e.attendees) ? e.attendees.length : 0,
        };
      });
      record({ stage: 'calendar_ok', provider: 'google', count: events.length });
      return res.json({ events });
    }

    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const url =
      `${GRAPH}/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}` +
      `&$select=subject,start,end,location,organizer,isAllDay,isOrganizer,onlineMeeting,onlineMeetingUrl,responseStatus,attendees,webLink` +
      `&$orderby=start/dateTime&$top=50`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' } });
    const data = await r.json();
    // 403 = the token predates the Calendars scope → ask the user to reconnect.
    if (r.status === 403) return res.json({ events: [], needsReconnect: true });
    if (!r.ok) throw new Error(data.error?.message || 'calendar fetch failed');
    const events = (data.value || []).map((e) => ({
      id: e.id,
      subject: e.subject || '(no title)',
      start: e.start?.dateTime ? `${e.start.dateTime}Z`.replace(/Z+$/, 'Z') : null,
      end: e.end?.dateTime ? `${e.end.dateTime}Z`.replace(/Z+$/, 'Z') : null,
      allDay: !!e.isAllDay,
      location: e.location?.displayName || '',
      organizer: e.organizer?.emailAddress?.name || e.organizer?.emailAddress?.address || '',
      isOrganizer: !!e.isOrganizer,
      joinUrl: e.onlineMeeting?.joinUrl || e.onlineMeetingUrl || null,
      response: e.responseStatus?.response || 'none', // none|organizer|accepted|declined|tentativelyAccepted|notResponded
      attendeeCount: Array.isArray(e.attendees) ? e.attendees.length : 0,
    }));
    record({ stage: 'calendar_ok', count: events.length });
    res.json({ events });
  } catch (e) {
    record({ stage: 'calendar_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

app.post('/calendar/rsvp', async (req, res) => {
  try {
    const { refreshToken, id, response, provider } = req.body || {};
    if (!id) throw new Error('missing event id');

    if (provider === 'google') {
      const status = { accept: 'accepted', decline: 'declined', tentative: 'tentative' }[String(response || '').toLowerCase()];
      if (!status) throw new Error('response must be accept | decline | tentative');
      const { accessToken } = await googleAccessFromRefresh(refreshToken);
      const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
      // Fetch the event, flip OUR attendee's responseStatus, patch it back.
      const gr = await fetch(`${GCAL}/calendars/primary/events/${encodeURIComponent(id)}`, { headers: auth });
      const ev = await gr.json();
      if (!gr.ok) throw new Error(ev.error?.message || 'event fetch failed');
      const attendees = (ev.attendees || []).map((a) => (a.self ? { ...a, responseStatus: status } : a));
      const pr = await fetch(`${GCAL}/calendars/primary/events/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: auth, body: JSON.stringify({ attendees }),
      });
      if (!pr.ok) { const d = await pr.json().catch(() => ({})); throw new Error(d.error?.message || 'RSVP failed'); }
      record({ stage: 'calendar_rsvp', provider: 'google', response });
      return res.json({ ok: true, response });
    }

    const action = { accept: 'accept', decline: 'decline', tentative: 'tentativelyAccept' }[String(response || '').toLowerCase()];
    if (!action) throw new Error('response must be accept | decline | tentative');
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const r = await fetch(`${GRAPH}/me/events/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendResponse: true }),
    });
    if (!r.ok && r.status !== 202) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error?.message || 'RSVP failed');
    }
    record({ stage: 'calendar_rsvp', response });
    res.json({ ok: true, response });
  } catch (e) {
    record({ stage: 'calendar_rsvp_error', message: e.message });
    res.status(400).json({ error: e.message });
  }
});

// ── 4g. Inbox health stats (snapshot from Graph) ─────────────────────────────
app.post('/health-stats', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const countOf = async (url) => {
      const r = await graphGet(url, accessToken); const d = await r.json();
      return r.ok ? (d['@odata.count'] ?? (d.value ? d.value.length : 0)) : 0;
    };
    const recv = await countOf(`${GRAPH}/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${weekAgo}&$count=true&$top=1`);
    const sent = await countOf(`${GRAPH}/me/mailFolders/sentitems/messages?$filter=sentDateTime ge ${weekAgo}&$count=true&$top=1`);
    const unread = await countOf(`${GRAPH}/me/mailFolders/inbox/messages?$filter=isRead eq false&$count=true&$top=1`);
    // Reply rate should reflect DIRECT communications only — exclude newsletters /
    // marketing by counting just Focused-inbox mail (Outlook files bulk as 'other').
    const recvFocused = await countOf(`${GRAPH}/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${weekAgo} and inferenceClassification eq 'focused'&$count=true&$top=1`);
    const base = recvFocused || recv;
    res.json({ received7d: recv, sent7d: sent, unread, replyRate: base ? Math.min(100, Math.round((sent / base) * 100)) : 0 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── 4h. Daily digest narrative ───────────────────────────────────────────────
app.post('/digest', async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!ANTHROPIC_API_KEY || !Array.isArray(items) || !items.length) return res.json({ digest: '' });
    const msg = await anthropic().messages.create({
      model: AI_MODEL, max_tokens: 400,
      system:
        'Write a short, friendly morning digest of someone\'s inbox as a NARRATIVE (not a list). ' +
        '3-5 sentences. Lead with what is urgent / needs action, mention meetings, then note ' +
        'low-priority bulk briefly. Be specific using the senders/subjects given. Plain text only.',
      messages: [{ role: 'user', content: JSON.stringify(items.slice(0, 30)) }],
    });
    const digest = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    bumpUsage('asks');
    res.json({ digest });
  } catch (e) {
    res.json({ digest: '' });
  }
});

// ── 4i. Voice → formatted email ──────────────────────────────────────────────
app.post('/voice-format', async (req, res) => {
  try {
    const { transcript } = req.body || {};
    if (!ANTHROPIC_API_KEY || !String(transcript || '').trim()) return res.json({ subject: '', body: '' });
    const msg = await anthropic().messages.create({
      model: AI_MODEL, max_tokens: 700,
      system:
        'Turn a rough dictated transcript into a clean, well-formatted professional email. ' +
        'Fix grammar/filler, add paragraphs, keep the speaker\'s intent and voice. Also propose ' +
        'a concise subject line. Reply ONLY JSON {"subject":"...","body":"..."} — no code fences.',
      messages: [{ role: 'user', content: String(transcript).slice(0, 3000) }],
    });
    let text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    bumpUsage('drafts');
    res.json({ subject: parsed.subject || '', body: parsed.body || '' });
  } catch (e) {
    res.json({ subject: '', body: '' });
  }
});

// ── 4d. One-tap smart reply suggestions ──────────────────────────────────────
app.post('/quick-replies', async (req, res) => {
  try {
    const { subject, body, senderName, id } = req.body || {};
    if (!ANTHROPIC_API_KEY) return res.json({ replies: [] });
    const cacheKey = id ? `qr:${id}:${cacheFp(senderName, subject)}` : '';
    const cached = auxGet(cacheKey);
    if (cached) return res.json(cached);
    if (!underDailyBudget()) return res.json({ replies: [] });
    const msg = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 300,
      system:
        'Given an email, suggest 2-3 very short one-tap replies the recipient could ' +
        'send (each under 12 words, natural and varied — e.g. an accept, a defer/decline, ' +
        'and a clarifying question where it fits). Reply with ONLY a JSON array of strings, ' +
        'no code fences.',
      messages: [{ role: 'user', content: `From: ${senderName || ''}\nSubject: ${subject || ''}\n\n${String(body || '').slice(0, 1500)}` }],
    });
    let text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    const out = { replies: arr.slice(0, 3).map((s) => String(s)) };
    bumpUsage('drafts'); countAi();
    auxSet(cacheKey, out);
    record({ stage: 'quickreplies_ok', n: arr.length });
    res.json(out);
  } catch (e) {
    record({ stage: 'quickreplies_error', message: e.message });
    res.json({ replies: [] }); // non-blocking
  }
});

// AI "what should I do" — a short recommendation + concrete next steps for an
// open email. Powers the recommendation card under the email body.
app.post('/next-steps', async (req, res) => {
  try {
    const { subject, body, senderName, id, note } = req.body || {};
    if (!ANTHROPIC_API_KEY) return res.json({ recommendation: '', steps: [] });
    const noteStr = String(note || '').trim().slice(0, 240);
    // Cache per email (+ note) so re-opening is free; skip when over the daily budget.
    const cacheKey = id ? `next:${id}:${cacheFp(senderName, subject)}${noteStr ? ':n' + noteStr.length : ''}` : '';
    const cached = auxGet(cacheKey);
    if (cached) return res.json(cached);
    if (!underDailyBudget()) return res.json({ recommendation: '', steps: [] });
    const msg = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      system:
        'You are an executive assistant. Given an email, tell the recipient what to do ' +
        'about it. Be decisive and specific to THIS email (mention amounts, dates, names, asks). ' +
        'CRITICAL: Do NOT call an email phishing, a scam, or fake unless there are STRONG signals ' +
        '(a lookalike or mismatched sender domain, a request to enter a password/credentials or ' +
        'move money urgently, or other clear red flags). Legitimate companies, banks, lenders, ' +
        'schools, and brands routinely send promotions, statements, receipts, and notifications — ' +
        'treat those as genuine, not threats. When unsure, assume the email is legitimate and just ' +
        'recommend the practical action (read, reply, pay, archive, etc.). ' +
        (noteStr ? `The user has TOLD YOU about this sender: "${noteStr}". Respect that and weight the email accordingly. ` : '') +
        'If it needs no action, say so briefly. Keep it tight. Reply ONLY JSON: ' +
        '{"recommendation":"ONE short sentence, 18 words max, on what to do","steps":["2-4 ' +
        'very short imperative next steps"]}. No code fences.',
      messages: [{ role: 'user', content: `From: ${senderName || ''}\nSubject: ${subject || ''}\n\n${String(body || '').slice(0, 2500)}` }],
    });
    let text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const out = { recommendation: String(parsed.recommendation || ''), steps: (parsed.steps || []).slice(0, 4).map((s) => String(s)) };
    bumpUsage('suggests'); countAi();
    auxSet(cacheKey, out);
    record({ stage: 'next_steps_ok' });
    res.json(out);
  } catch (e) {
    record({ stage: 'next_steps_error', message: e.message });
    res.json({ recommendation: '', steps: [] }); // non-blocking
  }
});

// AI learns from an email the user KEPT (rescued from auto-archive): read it,
// infer why it matters, and (when it reads as a real contact) suggest a sender
// classification so future actions adjust. Returns { reason, label }.
app.post('/learn-keep', async (req, res) => {
  try {
    const { email } = req.body || {};
    const e = email || {};
    if (!ANTHROPIC_API_KEY) return res.json({ reason: '', label: null });
    if (!underDailyBudget()) return res.json({ reason: '', label: null });
    const msg = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 200,
      system:
        'The user just RESCUED this email from auto-archiving — they want to keep mail like ' +
        'it. Infer WHY in a few words, and classify the sender so the app can stop burying ' +
        'similar mail. Reply ONLY JSON: {"reason":"≤10 words on why they likely keep this",' +
        '"label":"important|client|vendor|coworker|employee|keep"}. Use a relationship label ' +
        'only when it clearly fits (a real person/company they deal with); otherwise use ' +
        '"keep" (a newsletter/receipt/notification they simply want to retain). No code fences.',
      messages: [{ role: 'user', content: `From: ${e.from || ''}\nSubject: ${e.subject || ''}\nCurrent category: ${e.category || ''}\n\n${String(e.preview || '').slice(0, 1200)}` }],
    });
    let text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const allow = ['important', 'client', 'vendor', 'coworker', 'employee'];
    const label = allow.includes(parsed.label) ? parsed.label : null; // 'keep' → null
    bumpUsage('suggests'); countAi();
    record({ stage: 'learn_keep_ok', label });
    res.json({ reason: String(parsed.reason || '').slice(0, 80), label });
  } catch (e) {
    record({ stage: 'learn_keep_error', message: e.message });
    res.json({ reason: '', label: null }); // non-blocking
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
  'signature design and a person\'s real details as JSON. Design a NEW HTML email signature ' +
  'that captures the reference\'s layout, color palette, typography and decorative feel, ' +
  'but uses ONLY the exact details in the JSON. Hard requirements:\n' +
  '- Output ONLY raw HTML (no markdown, no code fences, no commentary).\n' +
  '- Email-safe HTML ONLY: a single root <table> with inline styles, web-safe fonts ' +
  '(Arial/Helvetica/Georgia), no <style> blocks, no <script>, no external CSS, no JS.\n' +
  '- MUST render in Outlook (Word engine): every <img> needs explicit width and height ' +
  'HTML attributes in px (e.g. <img width="96" height="96" ...>); do NOT rely on object-fit, ' +
  'flexbox, or background-image (all unsupported in Outlook). Use tables for all layout.\n' +
  '\n' +
  'STRICT DATA RULES (most important):\n' +
  '- Use ONLY the literal values present in the JSON. Render EVERY field that is present, ' +
  'and render NOTHING that is absent.\n' +
  '- NEVER invent, infer, guess, derive, or fabricate ANY value. In particular: do NOT ' +
  'derive a website from the email domain; do NOT invent a company name, slogan, tagline, ' +
  'department, descriptor (e.g. "Business Solutions"), address, phone, or social handle. ' +
  'If a field is not in the JSON it does NOT exist — leave it out entirely.\n' +
  '- Do NOT use placeholder, sample, or lorem-ipsum text of any kind.\n' +
  '- Reproduce each value EXACTLY as given (same spelling/casing of the actual text; you ' +
  'may style case via CSS text-transform, but never change the words).\n' +
  '\n' +
  'PHOTO RULES:\n' +
  '- If a photoUrl is provided, you MUST include exactly one <img> whose src is the EXACT ' +
  'photoUrl string (never omit it, never alter the URL). Give it explicit width AND height ' +
  'attributes (a square, e.g. 96x96) plus matching CSS width/height so it sizes correctly in ' +
  'Outlook. border-radius for a circle is fine (clients that support it round it; Outlook ' +
  'shows a square — that is acceptable). Show the photo at its NATURAL full color.\n' +
  '- NEVER alter the photo: no CSS filter, -webkit-filter, mix-blend-mode, opacity below 1, ' +
  'duotone, color overlay, tint, gradient over the image, or background-blend. The person\'s ' +
  'face must look exactly like the original photo.\n' +
  '- If NO photoUrl is provided, do NOT leave a blank/broken image area: render a tasteful ' +
  'monogram badge (initials in a circle using the accent color) or a clean text-only layout.\n' +
  '\n' +
  'QUALITY WITH LIMITED INFO:\n' +
  '- When few details are provided, prefer a clean, minimal, well-spaced layout. Do NOT pad ' +
  'empty space with invented content or oversized decoration — restraint over clutter. The ' +
  'result must look polished and intentional with no empty gaps. Keep max width ~520px.\n' +
  '\n' +
  'ACCENT COLOR (must obey):\n' +
  '- An "accent" hex color is provided in the JSON. Treat it as the PRIMARY brand color and ' +
  'use it everywhere the reference uses its main brand color: colored panels/banners, the ' +
  'highlighted part of the name, buttons, icon chips, dividers, accent underlines and links.\n' +
  '- The reference image guides LAYOUT, composition and decorative feel ONLY — NOT the exact ' +
  'hue. If the style notes mention a specific color (e.g. "blue panel"), recolor it to the ' +
  'provided accent. You may derive a slightly darker/lighter shade of the SAME accent for ' +
  'depth, plus neutral grays/cream/white, but do not introduce an unrelated brand color.\n' +
  '\n' +
  '- For icons use simple emoji (📞 ✉️ 🌐 📍) or small colored shapes — never icon fonts.\n' +
  '- Make links real from the provided values only: tel:, mailto:, and https://.\n' +
  '- NEVER include the words "ScaleMail", "Scale Mail", "Sent using", or "Best Email Software ' +
  'in Existence", and never add any "sent from" / footer / marketing sign-off line — a footer ' +
  'is added separately below your output.';

// Belt-and-suspenders cleanup of AI signature HTML: never let a photo filter or
// the ScaleMail footer slip through even if the model ignores the prompt.
function sanitizeSignatureHtml(html) {
  let out = String(html || '');
  // Strip any image-altering CSS (filters/tints/blends) wherever it appears.
  out = out.replace(/(?:-webkit-)?filter\s*:[^;"']*;?/gi, '');
  out = out.replace(/mix-blend-mode\s*:[^;"']*;?/gi, '');
  out = out.replace(/background-blend-mode\s*:[^;"']*;?/gi, '');
  // Remove any stray footer / branding line the model may have invented.
  out = out.replace(/Sent\s+using[\s\S]{0,160}?Best\s+Email\s+Software\s+in\s+Existence/gi, '');
  out = out.replace(/\bScale\s*Mail\b/gi, '');
  return out.trim();
}

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
          { type: 'text', text: `Reference style notes: ${cfg.brief}\n\n` +
            `Person's details (JSON) — these are the ONLY values that exist. Render every key ` +
            `present and NOTHING that is absent. Do not add a website, slogan, tagline, or any ` +
            `text that is not a value below:\n${JSON.stringify(details || {}, null, 2)}\n\n` +
            `Allowed fields present: ${Object.keys(details || {}).join(', ') || '(none)'}.\n` +
            (details && details.accent ? `PRIMARY brand/accent color = ${details.accent}. Use THIS color (and shades of it) for every colored element; recolor the reference's brand color to it.\n` : '') +
            `\nDesign the signature HTML now using only these values.` },
        ],
      }],
    });
    let html = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    html = html.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim(); // strip any stray fences
    html = sanitizeSignatureHtml(html);
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
    const { refreshToken, toEmail, subject, body, html, inReplyToId, sendAt, provider } = req.body || {};

    // ── iCloud path (SMTP) ──────────────────────────────────────────────────
    if (provider === 'icloud') {
      await icloudSend(refreshToken, { toEmail, subject, html, text: body, inReplyTo: inReplyToId });
      record({ stage: 'send_ok', provider: 'icloud' });
      return res.json({ ok: true });
    }

    // ── Gmail path ──────────────────────────────────────────────────────────
    if (provider === 'google') {
      const { accessToken } = await googleAccessFromRefresh(refreshToken);
      // For a reply, look up the original's thread + Message-ID so Gmail keeps the
      // conversation together (threadId in the request + In-Reply-To/References).
      let threadId = null; let inReplyHeader = '';
      if (inReplyToId) {
        try {
          const or = await gmailGet(`/messages/${inReplyToId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject`, accessToken);
          const od = await or.json();
          if (or.ok) { threadId = od.threadId || null; const mid = gmailHeader(od.payload, 'Message-ID'); if (mid) inReplyHeader = `In-Reply-To: ${mid}\r\nReferences: ${mid}\r\n`; }
        } catch (e) { /* fall back to a plain send */ }
      }
      const ctype = html ? 'text/html; charset=UTF-8' : 'text/plain; charset=UTF-8';
      const mime = [
        `To: ${toEmail}`,
        `Subject: ${subject || '(no subject)'}`,
        'MIME-Version: 1.0',
        `Content-Type: ${ctype}`,
      ].join('\r\n') + '\r\n' + inReplyHeader + '\r\n' + (html || body || '');
      const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const r = await fetch(`${GMAIL}/messages/send`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Gmail send failed');
      record({ stage: 'gmail_send_ok', reply: Boolean(inReplyToId) });
      return res.json({ ok: true });
    }

    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const content = html
      ? { contentType: 'HTML', content: html }
      : { contentType: 'Text', content: body || '' };

    // Scheduled send: create a draft with the deferred-send time, then send it.
    // Exchange transport holds the message until `sendAt`.
    if (sendAt && !inReplyToId) {
      const draftRes = await fetch(`${GRAPH}/me/messages`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({
          subject: subject || '(no subject)',
          body: content,
          toRecipients: [{ emailAddress: { address: toEmail } }],
          singleValueExtendedProperties: [{ id: 'SystemTime 0x3FEF', value: new Date(sendAt).toISOString() }],
        }),
      });
      const draft = await draftRes.json();
      if (!draftRes.ok) throw new Error(draft.error?.message || 'schedule failed');
      const sendRes = await fetch(`${GRAPH}/me/messages/${draft.id}/send`, { method: 'POST', headers: auth });
      if (!sendRes.ok) {
        const d = await sendRes.json().catch(() => ({}));
        throw new Error(d.error?.message || 'schedule send failed');
      }
      record({ stage: 'send_scheduled', at: sendAt });
      return res.json({ ok: true, scheduled: true });
    }

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
    // IMPORTANT: index emails by a SHORT integer `i`, not their real id. Graph
    // message ids are ~150 chars; making the model echo them back blew past
    // max_tokens and truncated the JSON (so it returned nothing). We map `i`
    // back to the real id here.
    const items = emails.map((e, i) => ({
      i,
      from: e.from,
      subject: e.subject,
      body: (e.body || '').slice(0, 500),
    }));
    const msg = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 2500,
      system:
        'You write ultra-terse email previews for a busy executive. For each email, write ' +
        'a SHORT phrase of 4-7 words (NOT a sentence) — just the gist or the ask, so it fits ' +
        'on one line. No greetings, no fluff, no period, no restating the sender. ' +
        'Reply with ONLY a JSON array of {"i": <the item index number>, "summary": "..."} ' +
        'for every item — no prose, no code fences.',
      messages: [{ role: 'user', content: JSON.stringify(items) }],
    });
    const text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('');
    const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    const out = {};
    arr.forEach((x) => {
      const idx = typeof x?.i === 'number' ? x.i : parseInt(x?.i, 10);
      if (Number.isInteger(idx) && emails[idx] && x.summary) out[emails[idx].id] = String(x.summary).trim().replace(/[.\s]+$/, '').slice(0, 64);
    });
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
// One-time cleanup: remove any legacy plaintext handoff files (pre-encryption) and
// expired encrypted ones left behind by a process recycle.
try {
  for (const f of fs.readdirSync(HANDOFF_DIR)) {
    if (f.endsWith('.json')) { try { fs.unlinkSync(path.join(HANDOFF_DIR, f)); } catch (e) {} }
  }
} catch (e) {}

app.listen(PORT, () => {
  console.log(`Scale Mail server listening on ${PORT}`);
  if (!ENC_KEY) console.warn('[WARN] SERVER_ENC_KEY is unset — sensitive data (OAuth handoffs, AI caches) will NOT persist to disk, so a process recycle mid-login shows "sign-in link expired". Set it before production.');
  if (!APP_API_KEY) console.warn('[WARN] APP_API_KEY is unset — the backend accepts requests without the app key. Set it (and EXPO_PUBLIC_APP_KEY in the app) before production.');
});

// Keep-alive: Render's free tier spins the server down after ~15 min of no
// inbound traffic, which is why the FIRST inbox load after a quiet spell takes
// 30–60s (a cold start) before any mail appears. Pinging our own public URL every
// ~10 minutes counts as inbound traffic and keeps the instance warm, so opening
// the app is fast. Only runs when Render provides the public URL, and never in a
// disabled state. (For production, a paid instance removes cold starts entirely.)
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '';
if (SELF_URL && process.env.KEEP_ALIVE !== 'off') {
  const ping = () => {
    fetch(`${SELF_URL.replace(/\/$/, '')}/health`).catch(() => {});
  };
  setInterval(ping, 10 * 60 * 1000).unref?.();
  console.log(`[keep-alive] pinging ${SELF_URL}/health every 10m to avoid cold starts`);
}
