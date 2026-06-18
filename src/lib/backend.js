// backend.js — talks to the Brisk server (Microsoft login, inbox, AI drafts, send).
// The server URL defaults to your deployed server below; you can still override it
// in Settings → "Backend server URL" if you ever move it.

export const DEFAULT_SERVER_URL = 'https://fyxer-email-assistant-1.onrender.com';

function base(url) {
  const v = (url || '').trim();
  return (v || DEFAULT_SERVER_URL).replace(/\/$/, '');
}

export function isBackendConfigured(serverUrl) {
  return base(serverUrl).length > 0;
}

// The URL the app opens in a browser to start Microsoft login. `appRedirect` is
// where the server bounces the user back to (this app's deep link).
export function microsoftLoginUrl(serverUrl, appRedirect, claim) {
  const params = new URLSearchParams();
  if (appRedirect) params.set('app_redirect', appRedirect);
  if (claim) params.set('claim', claim); // secret nonce the app already holds
  const q = params.toString();
  return `${base(serverUrl)}/auth/microsoft/start${q ? `?${q}` : ''}`;
}

async function post(serverUrl, path, body) {
  const res = await fetch(`${base(serverUrl)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Upload a signature photo (a data: URI) and get back a hosted https URL that
// renders in every email client (Gmail included). Returns { url }.
export function uploadSignatureImage(serverUrl, dataUri) {
  return post(serverUrl, '/upload', { dataUri });
}

// Trade a one-time sign-in session id for the real refresh token, over HTTPS.
// (The token is too long to survive the deep-link URL intact, so we fetch it.)
export function claimSession(serverUrl, session) {
  return post(serverUrl, '/auth/claim', { session });
}

// Fetch a mailbox folder (inbox | sent | drafts | archive). Returns
// { emails, refreshToken }.
export function fetchInbox(serverUrl, refreshToken, limit = 50, folder = 'inbox') {
  return post(serverUrl, '/inbox', { refreshToken, limit, folder });
}

// Fetch one message's full body on demand. Returns { body }.
export function fetchMessageBody(serverUrl, refreshToken, id) {
  return post(serverUrl, '/message', { refreshToken, id });
}

// Summarize a batch of emails (only send ones not already cached). Returns
// { summaries: { id: tldr } }.
export function summarizeEmails(serverUrl, items) {
  return post(serverUrl, '/summarize', { items });
}

// Search the whole mailbox via Graph. Returns { emails }.
export function searchMail(serverUrl, refreshToken, q) {
  return post(serverUrl, '/search', { refreshToken, q });
}

// AI chat over mail ("pull all emails about X"). Returns { answer, emails }.
export function askMail(serverUrl, refreshToken, q) {
  return post(serverUrl, '/ask', { refreshToken, q });
}

// Save a draft to the Outlook Drafts folder. Returns { id }.
export function saveDraft(serverUrl, payload) {
  return post(serverUrl, '/draft-save', payload);
}

// Ask Claude for writing suggestions on a draft. Returns { suggestions, improved }.
export function suggestEdits(serverUrl, body, context) {
  return post(serverUrl, '/suggest', { body, context });
}

// Set the user's M365 profile photo (what recipients see). Returns { ok }.
export function setMyPhoto(serverUrl, refreshToken, dataUri) {
  return post(serverUrl, '/me/photo', { refreshToken, dataUri });
}

// Get the user's current M365 photo. Returns { dataUri | null }.
export function getMyPhoto(serverUrl, refreshToken) {
  return post(serverUrl, '/me/photo/get', { refreshToken });
}

// Current month's AI usage vs cap. Returns { total, cap, ... }.
export async function fetchUsage(serverUrl) {
  const res = await fetch(`${base(serverUrl)}/usage`);
  if (!res.ok) throw new Error('usage unavailable');
  return res.json();
}

// Ask Claude to write a reply. Returns { text }.
export function aiDraft(serverUrl, payload) {
  return post(serverUrl, '/draft', payload);
}

// Send a reply. Returns { ok: true }.
export function sendReply(serverUrl, payload) {
  return post(serverUrl, '/send', payload);
}

// Ask Claude to design a signature in the given style from the user's details.
// Returns { html }.
export function aiGenerateSignature(serverUrl, style, details) {
  return post(serverUrl, '/signature/generate', { style, details });
}

// Fire-and-forget client telemetry so app-side events show up in /debug/status.
export function reportClientEvent(serverUrl, level, event, detail) {
  try {
    fetch(`${base(serverUrl)}/debug/client-log`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, event, detail, at: new Date().toISOString() }),
    }).catch(() => {});
  } catch (e) {}
}
