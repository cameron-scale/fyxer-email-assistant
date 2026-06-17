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
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.set('trust proxy', true);

// ── Config ───────────────────────────────────────────────────────────────────
const MS_CLIENT_ID = process.env.MS_CLIENT_ID || '';
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';

// Where Microsoft sends the user back, and where we then bounce them into the app.
const APP_REDIRECT = 'brisk://auth';
const MS_SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Mail.Read', 'Mail.Send'];
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
app.get('/', (_req, res) => res.send('Brisk server is running ✅'));
app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    microsoft: Boolean(MS_CLIENT_ID && MS_CLIENT_SECRET),
    ai: Boolean(ANTHROPIC_API_KEY),
    model: AI_MODEL,
    tenant: MS_TENANT,
  })
);

// ── 1. Microsoft login ───────────────────────────────────────────────────────
app.get('/auth/microsoft/start', (req, res) => {
  if (!MS_CLIENT_ID) return res.status(500).send('Server missing MS_CLIENT_ID');
  // The app tells us where to send the user back (its own deep link). We stash it
  // in `state` so we get it back on the callback. This makes it work in Expo Go
  // (an exp:// URL) and in a real build (brisk://) alike.
  const appRedirect = String(req.query.app_redirect || APP_REDIRECT);
  const state = Buffer.from(appRedirect).toString('base64url');
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

function decodeAppRedirect(req) {
  const stateRaw = req.query.state ? String(req.query.state) : '';
  try { if (stateRaw) return Buffer.from(stateRaw, 'base64url').toString('utf8'); } catch (e) {}
  return APP_REDIRECT;
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

app.get('/auth/microsoft/callback', async (req, res) => {
  const appRedirect = decodeAppRedirect(req);
  const debug = appRedirect === 'debug';
  const finish = (query, ok, detail) => {
    if (debug) return res.send(debugPage(ok, detail || query));
    const sep = appRedirect.includes('?') ? '&' : '?';
    return res.redirect(`${appRedirect}${sep}${query}`);
  };

  const { code, error, error_description } = req.query;
  if (error) return finish(`error=${encodeURIComponent(error_description || error)}`, false, String(error_description || error));
  if (!code) return finish('error=missing_code', false, 'No authorization code was returned by Microsoft.');
  try {
    const tokens = await msToken({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: redirectUri(req),
    });
    // Hand the refresh token back to the app. The app stores it securely and sends
    // it to us on each request to mint a fresh access token.
    return finish(
      `provider=outlook&refresh=${encodeURIComponent(tokens.refresh_token)}`,
      true,
      `Refresh token received (length ${String(tokens.refresh_token || '').length}).`
    );
  } catch (e) {
    return finish(`error=${encodeURIComponent(e.message)}`, false, e.message);
  }
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
  if (!r.ok) throw new Error(data.error_description || data.error || 'token exchange failed');
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function accessTokenFromRefresh(refreshToken) {
  if (!refreshToken) throw new Error('not connected');
  const data = await msToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
}

// ── 2 + 3. Inbox (Graph fetch + AI summaries) ────────────────────────────────
app.post('/inbox', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    const { accessToken, refreshToken: newRt } = await accessTokenFromRefresh(refreshToken);

    const url =
      `${GRAPH}/me/messages?$top=25` +
      `&$select=subject,from,bodyPreview,body,receivedDateTime,isRead,flag` +
      `&$orderby=receivedDateTime desc`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Graph fetch failed');

    const emails = (data.value || []).map((m) => ({
      id: m.id,
      account: 'outlook',
      from: m.from?.emailAddress
        ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>`
        : '',
      subject: m.subject || '(no subject)',
      body: stripHtml(m.body?.content || m.bodyPreview || ''),
      date: m.receivedDateTime || new Date().toISOString(),
      read: !!m.isRead,
      flagged: m.flag?.flagStatus === 'flagged',
    }));

    // Add one-line AI summaries (best-effort; never blocks the inbox).
    const summaries = await aiSummarize(emails);
    emails.forEach((e) => { if (summaries[e.id]) e.aiSummary = summaries[e.id]; });

    res.json({ emails, refreshToken: newRt });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── 4. AI-written reply draft ────────────────────────────────────────────────
app.post('/draft', async (req, res) => {
  try {
    const { subject, body, senderName, tone = 'professional', signature = 'Cameron' } = req.body || {};
    const text = await aiDraft({ subject, body, senderName, tone, signature });
    res.json({ text });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── 5. Send a reply ──────────────────────────────────────────────────────────
app.post('/send', async (req, res) => {
  try {
    const { refreshToken, toEmail, subject, body, inReplyToId } = req.body || {};
    const { accessToken } = await accessTokenFromRefresh(refreshToken);
    const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    let r;
    if (inReplyToId) {
      // Reply on the original thread (keeps the conversation together).
      r = await fetch(`${GRAPH}/me/messages/${inReplyToId}/reply`, {
        method: 'POST', headers: auth, body: JSON.stringify({ comment: body }),
      });
    } else {
      r = await fetch(`${GRAPH}/me/sendMail`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({
          message: {
            subject: subject || '(no subject)',
            body: { contentType: 'Text', content: body || '' },
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
    res.json({ ok: true });
  } catch (e) {
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
        'You summarize work emails for a busy executive. For each email, write ONE tight, ' +
        'plain sentence (max 18 words) capturing what it is and what it wants. ' +
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
