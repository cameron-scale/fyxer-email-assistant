// store.js
// A tiny global "store" so every screen can read the inbox and trigger actions
// without passing props down through ten layers. Uses React Context — think of it
// as one shared box of data the whole app can reach into.

import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { prioritize } from './lib/priority';
import { demoEmails } from './data/demoEmails';
import { fetchGmail } from './api/gmail';
import { fetchOutlook } from './api/outlook';
import { saveToken, getToken, clearToken } from './lib/storage';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  // Raw emails keyed nothing fancy — just an array. Demo data to start.
  const [raw, setRaw] = useState(demoEmails);
  const [accounts, setAccounts] = useState({ demo: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Per-email local state the user creates: archived / snoozed / done / read.
  const [overrides, setOverrides] = useState({}); // id -> { status, read, snoozedUntil }

  // Build the prioritized, filtered list the UI shows.
  const emails = useMemo(() => {
    const now = Date.now();
    const merged = raw.map((e) => ({ ...e, ...(overrides[e.id] || {}) }));
    const visible = merged.filter((e) => {
      if (e.status === 'archived' || e.status === 'done') return false;
      if (e.snoozedUntil && e.snoozedUntil > now) return false;
      return true;
    });
    return prioritize(visible);
  }, [raw, overrides]);

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

  // --- Actions used by swipes / buttons ---
  const archive = useCallback((id) => setOverride(id, { status: 'archived' }), [setOverride]);
  const markDone = useCallback((id) => setOverride(id, { status: 'done' }), [setOverride]);
  const markRead = useCallback((id) => setOverride(id, { read: true }), [setOverride]);
  const snooze = useCallback(
    (id, hours = 4) => setOverride(id, { snoozedUntil: Date.now() + hours * 3600000 }),
    [setOverride]
  );
  const undo = useCallback((id) => setOverride(id, { status: undefined, snoozedUntil: undefined }), [setOverride]);

  // --- Connecting a real account ---
  const loadAccount = useCallback(async (provider, token) => {
    setLoading(true);
    setError(null);
    try {
      await saveToken(`token_${provider}`, token);
      const fetched =
        provider === 'gmail' ? await fetchGmail(token) : await fetchOutlook(token);
      // Drop demo data the first time a real account connects.
      setRaw((prev) => {
        const noDemo = prev.filter((e) => e.account !== 'demo');
        const ids = new Set(noDemo.map((e) => e.id));
        return [...noDemo, ...fetched.filter((e) => !ids.has(e.id))];
      });
      setAccounts((a) => ({ ...a, [provider]: true, demo: false }));
    } catch (e) {
      setError(e.message || 'Could not load mail');
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch any connected real accounts (pull-to-refresh).
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      for (const provider of ['gmail', 'outlook']) {
        if (!accounts[provider]) continue;
        const token = await getToken(`token_${provider}`);
        if (!token) continue;
        const fetched =
          provider === 'gmail' ? await fetchGmail(token) : await fetchOutlook(token);
        setRaw((prev) => {
          const others = prev.filter((e) => e.account !== provider);
          return [...others, ...fetched];
        });
      }
    } catch (e) {
      setError(e.message || 'Refresh failed');
    } finally {
      setLoading(false);
    }
  }, [accounts]);

  const disconnect = useCallback(async (provider) => {
    await clearToken(`token_${provider}`);
    setRaw((prev) => prev.filter((e) => e.account !== provider));
    setAccounts((a) => {
      const next = { ...a, [provider]: false };
      const anyReal = next.gmail || next.outlook;
      if (!anyReal) {
        next.demo = true;
        return next;
      }
      return next;
    });
    setRaw((prev) => (prev.length === 0 ? demoEmails : prev));
  }, []);

  const value = {
    emails,
    counts,
    accounts,
    loading,
    error,
    archive,
    markDone,
    markRead,
    snooze,
    undo,
    loadAccount,
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
