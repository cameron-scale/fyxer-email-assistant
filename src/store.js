// store.js
// A tiny global "store" so every screen can read the inbox and trigger actions
// without passing props down through ten layers. Uses React Context — think of it
// as one shared box of data the whole app can reach into.

import React, {
  createContext, useContext, useCallback, useMemo, useState, useEffect,
} from 'react';
import { prioritize } from './lib/priority';
import { demoEmails } from './data/demoEmails';
import { fetchGmail } from './api/gmail';
import { fetchInbox } from './lib/backend';
import { saveToken, getToken, clearToken } from './lib/storage';

const DEFAULT_PREFS = { tone: 'professional', signature: 'Cameron', serverUrl: '' };

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  // Raw emails keyed nothing fancy — just an array. Demo data to start.
  const [raw, setRaw] = useState(demoEmails);
  const [accounts, setAccounts] = useState({ demo: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Per-email local state the user creates: archived / snoozed / done / read.
  const [overrides, setOverrides] = useState({}); // id -> { status, read, snoozedUntil }

  // The most recent reversible action, powering the Undo snackbar.
  const [recentAction, setRecentAction] = useState(null); // { id, label }

  // VIP senders the user has "taught" us, plus draft preferences. Both persist.
  const [vips, setVips] = useState([]); // lowercased emails
  const [prefs, setPrefsState] = useState(DEFAULT_PREFS);

  // Microsoft refresh token (kept in the encrypted keychain) for backend login.
  const [outlookRefresh, setOutlookRefresh] = useState(null);

  // Load saved VIPs + prefs + tokens once when the app starts.
  useEffect(() => {
    (async () => {
      try {
        const v = await getToken('vips');
        if (v) setVips(JSON.parse(v));
        const p = await getToken('prefs');
        if (p) setPrefsState({ ...DEFAULT_PREFS, ...JSON.parse(p) });
        const rt = await getToken('outlook_refresh');
        if (rt) {
          setOutlookRefresh(rt);
          setAccounts((a) => ({ ...a, outlook: true, demo: false }));
        }
      } catch (e) {}
    })();
  }, []);

  // Build the prioritized, filtered list the UI shows.
  const emails = useMemo(() => {
    const now = Date.now();
    const merged = raw.map((e) => ({ ...e, ...(overrides[e.id] || {}) }));
    const visible = merged.filter((e) => {
      if (e.status === 'archived' || e.status === 'done') return false;
      if (e.snoozedUntil && e.snoozedUntil > now) return false;
      return true;
    });
    return prioritize(visible, vips);
  }, [raw, overrides, vips]);

  const counts = useMemo(() => {
    const c = { urgent: 0, important: 0, fyi: 0, noise: 0, total: emails.length };
    emails.forEach((e) => {
      c[e.priority.bucket] += 1;
    });
    return c;
  }, [emails]);

  const setOverride = useCallback((id, patch) => {
    setOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), ...patch } }));
  }, []);

  // --- Actions used by swipes / buttons (each records an undoable "recent action") ---
  const archive = useCallback((id) => {
    setOverride(id, { status: 'archived' });
    setRecentAction({ id, label: 'Archived' });
  }, [setOverride]);

  const markDone = useCallback((id) => {
    setOverride(id, { status: 'done' });
    setRecentAction({ id, label: 'Marked done' });
  }, [setOverride]);

  const markRead = useCallback((id) => setOverride(id, { read: true }), [setOverride]);

  const snooze = useCallback((id, hours = 4) => {
    setOverride(id, { snoozedUntil: Date.now() + hours * 3600000 });
    setRecentAction({ id, label: 'Snoozed 4h' });
  }, [setOverride]);

  // Revert whatever the snackbar is currently offering to undo.
  const undoLast = useCallback(() => {
    setRecentAction((cur) => {
      if (cur) setOverride(cur.id, { status: undefined, snoozedUntil: undefined });
      return null;
    });
  }, [setOverride]);

  const dismissRecent = useCallback(() => setRecentAction(null), []);

  // --- Teach Brisk: mark/unmark a sender as VIP (persists on the device) ---
  const toggleVip = useCallback((senderEmail) => {
    const email = (senderEmail || '').toLowerCase();
    if (!email) return;
    setVips((list) => {
      const next = list.includes(email)
        ? list.filter((e) => e !== email)
        : [...list, email];
      saveToken('vips', JSON.stringify(next));
      return next;
    });
  }, []);

  // --- Draft preferences: reply tone + signature (persists) ---
  const setPrefs = useCallback((patch) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      saveToken('prefs', JSON.stringify(next));
      return next;
    });
  }, []);

  // Pull the latest Outlook mail (with AI summaries) from the backend.
  const loadOutlook = useCallback(async (refreshToken) => {
    const rt = refreshToken || outlookRefresh;
    if (!rt) throw new Error('Outlook not connected');
    const { emails: fetched, refreshToken: newRt } = await fetchInbox(prefs.serverUrl, rt);
    if (newRt && newRt !== rt) {
      await saveToken('outlook_refresh', newRt);
      setOutlookRefresh(newRt);
    }
    // Replace demo + old outlook mail with the fresh batch.
    setRaw((prev) => {
      const others = prev.filter((e) => e.account !== 'outlook' && e.account !== 'demo');
      return [...others, ...fetched];
    });
  }, [outlookRefresh, prefs.serverUrl]);

  // Called after Microsoft login hands back a refresh token.
  const connectOutlook = useCallback(async (refreshToken) => {
    setLoading(true);
    setError(null);
    try {
      await saveToken('outlook_refresh', refreshToken);
      setOutlookRefresh(refreshToken);
      setAccounts((a) => ({ ...a, outlook: true, demo: false }));
      await loadOutlook(refreshToken);
    } catch (e) {
      setError(e.message || 'Could not load Outlook mail');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadOutlook]);

  // Connect Gmail (on-device, when its client ID is set). Outlook uses the backend.
  const loadAccount = useCallback(async (provider, token) => {
    if (provider === 'gmail') {
      setLoading(true);
      setError(null);
      try {
        await saveToken('token_gmail', token);
        const fetched = await fetchGmail(token);
        setRaw((prev) => {
          const others = prev.filter((e) => e.account !== 'gmail' && e.account !== 'demo');
          return [...others, ...fetched];
        });
        setAccounts((a) => ({ ...a, gmail: true, demo: false }));
      } catch (e) {
        setError(e.message || 'Could not load mail');
      } finally {
        setLoading(false);
      }
    }
  }, []);

  // Pull-to-refresh: re-fetch whatever real accounts are connected.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (accounts.outlook && outlookRefresh) await loadOutlook();
      if (accounts.gmail) {
        const token = await getToken('token_gmail');
        if (token) {
          const fetched = await fetchGmail(token);
          setRaw((prev) => {
            const others = prev.filter((e) => e.account !== 'gmail');
            return [...others, ...fetched];
          });
        }
      }
    } catch (e) {
      setError(e.message || 'Refresh failed');
    } finally {
      setLoading(false);
    }
  }, [accounts, outlookRefresh, loadOutlook]);

  const disconnect = useCallback(async (provider) => {
    await clearToken(provider === 'outlook' ? 'outlook_refresh' : 'token_gmail');
    if (provider === 'outlook') setOutlookRefresh(null);
    setRaw((prev) => {
      const kept = prev.filter((e) => e.account !== provider);
      return kept.length === 0 ? demoEmails : kept;
    });
    setAccounts((a) => {
      const next = { ...a, [provider]: false };
      if (!next.gmail && !next.outlook) next.demo = true;
      return next;
    });
  }, []);

  const value = {
    emails,
    counts,
    accounts,
    loading,
    error,
    vips,
    prefs,
    recentAction,
    archive,
    markDone,
    markRead,
    snooze,
    undoLast,
    dismissRecent,
    toggleVip,
    setPrefs,
    loadAccount,
    connectOutlook,
    outlookRefresh,
    refresh,
    disconnect,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
