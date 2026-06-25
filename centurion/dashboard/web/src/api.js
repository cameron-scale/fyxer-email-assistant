// Tiny API client for the Centurion backend.
// The dashboard token (CENTURION_DASHBOARD_TOKEN) is required for control
// actions; it's kept in localStorage and asked for once on first use.

const TOKEN_KEY = "centurion_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}

export async function fetchState() {
  const r = await fetch("/api/state", { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`state ${r.status}`);
  return r.json();
}

export async function getSettings() {
  const r = await fetch("/api/settings", { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`settings ${r.status}`);
  return r.json();
}

export async function saveSettings(values) {
  let token = getToken();
  if (!token) {
    token = window.prompt("Enter your CENTURION_DASHBOARD_TOKEN to save settings:") || "";
    if (token) setToken(token);
  }
  const r = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Centurion-Token": token },
    body: JSON.stringify({ values, token }),
  });
  if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); throw new Error("Unauthorized — check your dashboard token."); }
  if (!r.ok) throw new Error(`save settings ${r.status}`);
  return r.json();
}

export async function chat(message) {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!r.ok) throw new Error(`chat ${r.status}`);
  return r.json();
}

export async function control(path, body = {}) {
  let token = getToken();
  if (!token) {
    token = window.prompt("Enter your CENTURION_DASHBOARD_TOKEN to control the agent:") || "";
    if (token) setToken(token);
  }
  const r = await fetch(`/api/control/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Centurion-Token": token },
    body: JSON.stringify({ ...body, token }),
  });
  if (r.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error("Unauthorized — check your dashboard token.");
  }
  if (!r.ok) throw new Error(`control ${path} ${r.status}`);
  return r.json();
}
