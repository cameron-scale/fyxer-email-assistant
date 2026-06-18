// store.js
// A tiny global "store" so every screen can read the inbox and trigger actions
// without passing props down through ten layers. Uses React Context — think of it
// as one shared box of data the whole app can reach into.

import React, {
  createContext, useContext, useCallback, useMemo, useState, useEffect, useRef,
} from 'react';
import { prioritize } from './lib/priority';
import { DEMO_EMAILS } from './lib/demo';
import { fetchGmail } from './api/gmail';
import {
  fetchInbox, fetchMessageBody, summarizeEmails, searchMail, askMail, setMyPhoto,
  DEFAULT_SERVER_URL,
} from './lib/backend';
import { saveToken, getToken, clearToken } from './lib/storage';

// How sorting works. "importance" defers to the on-device priority engine.
export const SORTS = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'name-asc': 'Sender A–Z',
  'name-desc': 'Sender Z–A',
  importance: 'Importance',
};
// How many fresh emails to auto-summarize per load (bounds AI cost).
const SUMMARIZE_CAP = 60;

const DEFAULT_PREFS = { tone: 'professional', signature: 'Cameron', serverUrl: DEFAULT_SERVER_URL, sig: null, categories: [], photoGallery: [], avatarUri: null };

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  // Raw emails — empty until a real account is connected.
  const [raw, setRaw] = useState([]);
  const [accounts, setAccounts] = useState({});
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

  // Which aurora-background palette is active (driven by the current folder/email).
  const [palette, setPaletteState] = useState('default');
  const setPalette = useCallback((name) => setPaletteState(name || 'default'), []);

  // First-launch tutorial: demo mode swaps in fake emails during the walkthrough.
  const [tourActive, setTourActive] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const startTour = useCallback(() => { setDemoMode(true); setTourActive(true); }, []);
  const endTour = useCallback(() => {
    setTourActive(false); setDemoMode(false);
    saveToken('hasSeenTutorial', 'true');
  }, []);

  // Inbox sort order.
  const [sortBy, setSortBy] = useState('date-desc');

  // Cached AI TL;DR summaries (id -> text). Cached so reloading never re-bills AI.
  const [summaries, setSummaries] = useState({});
  const summariesRef = useRef({});
  useEffect(() => { summariesRef.current = summaries; }, [summaries]);

  // Sent / Drafts folders (fetched on demand from Graph), kept separate from inbox.
  const [folders, setFolders] = useState({ sent: [], drafts: [] });
  const [folderLoading, setFolderLoading] = useState(false);

  // Whole-mailbox search results (Graph), shown in place of the inbox while active.
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [searching, setSearching] = useState(false);
  const [chatAnswer, setChatAnswer] = useState(null); // AI answer banner text

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
          setAccounts((a) => ({ ...a, outlook: true }));
        }
        // First-ever launch → run the tutorial with demo data.
        const seen = await getToken('hasSeenTutorial');
        if (!seen) { setDemoMode(true); setTourActive(true); }
      } catch (e) {}
    })();
  }, []);

  // Build the prioritized, filtered, sorted list the UI shows.
  const emails = useMemo(() => {
    if (demoMode) return DEMO_EMAILS; // fake walkthrough inbox (already prioritized)
    const now = Date.now();
    const merged = raw.map((e) => ({
      ...e,
      ...(overrides[e.id] || {}),
      aiSummary: e.aiSummary || summaries[e.id], // feed the cached TL;DR into priority.tldr
    }));
    const visible = merged.filter((e) => {
      if (e.status === 'archived' || e.status === 'done') return false;
      if (e.snoozedUntil && e.snoozedUntil > now) return false;
      return true;
    });
    const ranked = prioritize(visible, vips, prefs.categories); // importance order + attaches .priority
    const byName = (a, b) => (a.priority.senderName || '').localeCompare(b.priority.senderName || '');
    const byDate = (a, b) => new Date(b.date) - new Date(a.date);
    const sorted = [...ranked];
    if (sortBy === 'date-desc') sorted.sort(byDate);
    else if (sortBy === 'date-asc') sorted.sort((a, b) => -byDate(a, b));
    else if (sortBy === 'name-asc') sorted.sort(byName);
    else if (sortBy === 'name-desc') sorted.sort((a, b) => -byName(a, b));
    // 'importance' keeps the prioritize() order.
    return sorted;
  }, [raw, overrides, vips, summaries, sortBy, prefs.categories, demoMode]);

  // Prioritized view of whole-mailbox search results (null when not searching).
  const searchEmails = useMemo(() => {
    if (!searchResults) return null;
    const merged = searchResults.map((e) => ({
      ...e, ...(overrides[e.id] || {}), aiSummary: e.aiSummary || summaries[e.id],
    }));
    return prioritize(merged, vips, prefs.categories);
  }, [searchResults, overrides, summaries, vips, prefs.categories]);

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

  // Set the user's avatar: cache it locally (in-app) AND push it to M365 so it
  // shows in recipients' inboxes (best-effort — some tenants block photo writes).
  const updateAvatar = useCallback(async (dataUri) => {
    setPrefs({ avatarUri: dataUri });
    if (outlookRefresh) {
      try { await setMyPhoto(prefs.serverUrl, outlookRefresh, dataUri); return { synced: true }; }
      catch (e) { return { synced: false, error: e.message }; }
    }
    return { synced: false };
  }, [outlookRefresh, prefs.serverUrl, setPrefs]);

  // Summarize a batch of emails — but ONLY ones we haven't cached yet, capped, so
  // reloading the inbox is free and the bill stays small.
  const summarizeBatch = useCallback(async (list) => {
    const todo = list.filter((e) => !summariesRef.current[e.id]).slice(0, SUMMARIZE_CAP);
    for (let i = 0; i < todo.length; i += 15) {
      const chunk = todo.slice(i, i + 15);
      try {
        const { summaries: got } = await summarizeEmails(
          prefs.serverUrl,
          chunk.map((e) => ({ id: e.id, from: e.from, subject: e.subject, preview: e.body })),
        );
        if (got && Object.keys(got).length) setSummaries((s) => ({ ...s, ...got }));
      } catch (e) { /* summaries are best-effort */ }
    }
  }, [prefs.serverUrl]);

  // Load the full body of one email on demand (the list only carries a preview).
  // Keeps the stripped text for priority/summary, plus sanitized HTML + any
  // detected meeting link for rich display.
  const loadFullBody = useCallback(async (id) => {
    const target = raw.find((e) => e.id === id);
    if (!target || target.account !== 'outlook' || target.fullBody) return;
    try {
      const { body, bodyHtml, meeting } = await fetchMessageBody(prefs.serverUrl, outlookRefresh, id);
      setRaw((prev) => prev.map((e) => (
        e.id === id ? { ...e, body: body || e.body, bodyHtml: bodyHtml || '', meeting: meeting || null, fullBody: true } : e
      )));
    } catch (e) { /* keep the preview if the fetch fails */ }
  }, [raw, outlookRefresh, prefs.serverUrl]);

  // Pull the latest Outlook inbox from the backend (fast: one page of 50).
  const loadOutlook = useCallback(async (refreshToken) => {
    const rt = refreshToken || outlookRefresh;
    if (!rt) throw new Error('Outlook not connected');
    const { emails: fetched, refreshToken: newRt } = await fetchInbox(prefs.serverUrl, rt, 50, 'inbox');
    if (newRt && newRt !== rt) {
      await saveToken('outlook_refresh', newRt);
      setOutlookRefresh(newRt);
    }
    // Replace old outlook mail with the fresh batch.
    setRaw((prev) => {
      const others = prev.filter((e) => e.account !== 'outlook');
      return [...others, ...fetched];
    });
    summarizeBatch(fetched); // fire-and-forget; only summarizes new, uncached mail
  }, [outlookRefresh, prefs.serverUrl, summarizeBatch]);

  // Load the Sent or Drafts folder on demand (for those tabs).
  const loadFolder = useCallback(async (name) => {
    const rt = outlookRefresh;
    if (!rt) return;
    setFolderLoading(true);
    try {
      const { emails: fetched } = await fetchInbox(prefs.serverUrl, rt, 50, name);
      setFolders((f) => ({ ...f, [name]: fetched }));
    } catch (e) { /* leave previous */ } finally { setFolderLoading(false); }
  }, [outlookRefresh, prefs.serverUrl]);

  // Whole-mailbox search via Graph (finds old mail the device never loaded).
  const runSearch = useCallback(async (q) => {
    const query = (q || '').trim();
    if (!query) { setSearchResults(null); return; }
    if (!outlookRefresh) return;
    setSearching(true);
    try {
      const { emails: found } = await searchMail(prefs.serverUrl, outlookRefresh, query);
      setSearchResults(found || []);
      summarizeBatch(found || []);
    } catch (e) {
      setError(e.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [outlookRefresh, prefs.serverUrl, summarizeBatch]);
  const clearSearch = useCallback(() => { setSearchResults(null); setSearching(false); setChatAnswer(null); }, []);

  // AI chat: ask a question, get an answer + the relevant emails shown in the list.
  const askMailQuestion = useCallback(async (q) => {
    const query = (q || '').trim();
    if (!query) { setSearchResults(null); setChatAnswer(null); return; }
    if (!outlookRefresh) return;
    setSearching(true);
    setChatAnswer(null);
    try {
      const { answer, emails: found } = await askMail(prefs.serverUrl, outlookRefresh, query);
      setSearchResults(found || []);
      setChatAnswer(answer || '');
      summarizeBatch(found || []);
    } catch (e) {
      setError(e.message || 'Could not ask');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [outlookRefresh, prefs.serverUrl, summarizeBatch]);

  // Auto-load the inbox once on launch when a saved Outlook session is restored,
  // so mail appears without needing a manual pull-to-refresh.
  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (outlookRefresh && !didInitialLoad.current) {
      didInitialLoad.current = true;
      setLoading(true);
      loadOutlook(outlookRefresh)
        .catch((e) => setError(e.message || 'Could not load mail'))
        .finally(() => setLoading(false));
    }
  }, [outlookRefresh, loadOutlook]);

  // Called after Microsoft login hands back a refresh token.
  const connectOutlook = useCallback(async (refreshToken) => {
    setLoading(true);
    setError(null);
    try {
      await saveToken('outlook_refresh', refreshToken);
      setOutlookRefresh(refreshToken);
      setAccounts((a) => ({ ...a, outlook: true }));
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
          const others = prev.filter((e) => e.account !== 'gmail');
          return [...others, ...fetched];
        });
        setAccounts((a) => ({ ...a, gmail: true }));
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
      return kept;
    });
    setAccounts((a) => {
      const next = { ...a, [provider]: false };
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
    palette,
    setPalette,
    tourActive,
    demoMode,
    startTour,
    endTour,
    sortBy,
    setSortBy,
    summaries,
    loadFullBody,
    folders,
    folderLoading,
    loadFolder,
    updateAvatar,
    searchEmails,
    searching,
    runSearch,
    clearSearch,
    chatAnswer,
    askMailQuestion,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
