// backend.js — talks to the Brisk server (Microsoft login, inbox, AI drafts, send).
// The server URL is whatever you paste into Settings → "Backend server URL".

function base(url) {
  return (url || '').trim().replace(/\/$/, '');
}

export function isBackendConfigured(serverUrl) {
  return base(serverUrl).length > 0;
}

// The URL the app opens in a browser to start Microsoft login. `appRedirect` is
// where the server bounces the user back to (this app's deep link).
export function microsoftLoginUrl(serverUrl, appRedirect) {
  const q = appRedirect ? `?app_redirect=${encodeURIComponent(appRedirect)}` : '';
  return `${base(serverUrl)}/auth/microsoft/start${q}`;
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

// Fetch the inbox (with AI summaries). Returns { emails, refreshToken }.
export function fetchInbox(serverUrl, refreshToken) {
  return post(serverUrl, '/inbox', { refreshToken });
}

// Ask Claude to write a reply. Returns { text }.
export function aiDraft(serverUrl, payload) {
  return post(serverUrl, '/draft', payload);
}

// Send a reply. Returns { ok: true }.
export function sendReply(serverUrl, payload) {
  return post(serverUrl, '/send', payload);
}
