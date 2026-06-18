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
  listFolders, DEFAULT_SERVER_URL,
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

  // Per-account mailbox totals from Graph (so the badge matches Outlook even
  // before all mail is loaded), plus background "sync the rest" progress.
  const [accountStats, setAccountStats] = useState({}); // id -> { unread, total }
  const [syncingAll, setSyncingAll] = useState(false);
  const syncAbort = useRef(false);

  // Multiple linked mailboxes. Each: { id, type:'outlook', email, refreshToken }.
  // `activeAccountId` is a specific account id, or 'all' for a unified inbox.
  const [mailAccounts, setMailAccounts] = useState([]);
  const mailAccountsRef = useRef([]);
  useEffect(() => { mailAccountsRef.current = mailAccounts; }, [mailAccounts]);
  const [activeAccountId, setActiveAccountId] = useState('all');
  // The active account's folder list + who it belongs to (for the drawer).
  const [mailFolders, setMailFolders] = useState([]);
  const [folderMeta, setFolderMeta] = useState(null); // { email, displayName }
  const [foldersLoading, setFoldersLoading] = useState(false);
  // Which folder the list is showing (null = Inbox / unified).
  const [currentFolder, setCurrentFolder] = useState(null); // { id, name, kind }

  // The account ids in the active scope ('all' = every linked mailbox).
  const scopeIds = useMemo(() => {
    if (mailAccounts.length) return activeAccountId === 'all' ? mailAccounts.map((a) => a.id) : [activeAccountId];
    return ['legacy'];
  }, [mailAccounts, activeAccountId]);
  // Unread/total for the active scope (sum across accounts), matching Outlook.
  const mailboxUnread = useMemo(() => {
    let any = false; let sum = 0;
    for (const id of scopeIds) { const s = accountStats[id]; if (s && s.unread != null) { any = true; sum += s.unread; } }
    return any ? sum : null;
  }, [accountStats, scopeIds]);
  const mailboxTotal = useMemo(() => {
    let any = false; let sum = 0;
    for (const id of scopeIds) { const s = accountStats[id]; if (s && s.total != null) { any = true; sum += s.total; } }
    return any ? sum : null;
  }, [accountStats, scopeIds]);

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
        // Restore linked mailboxes. Migrate a legacy single token into the list.
        let list = [];
        try { list = JSON.parse((await getToken('mail_accounts')) || '[]') || []; } catch (e) { list = []; }
        const rt = await getToken('outlook_refresh');
        if (rt && !list.some((a) => a.refreshToken === rt)) {
          list = [{ id: `outlook-${Date.now()}`, type: 'outlook', email: null, refreshToken: rt }, ...list];
        }
        if (list.length) {
          mailAccountsRef.current = list;
          setMailAccounts(list);
          setActiveAccountId(list.length > 1 ? 'all' : list[0].id);
          const primary = list[0].refreshToken;
          setOutlookRefresh(primary);
          setAccounts((a) => ({ ...a, outlook: true }));
          await saveToken('mail_accounts', JSON.stringify(list));
        } else if (rt) {
          setOutlookRefresh(rt);
          setAccounts((a) => ({ ...a, outlook: true }));
        }
        // First-ever launch → run the tutorial with demo data.
        const seen = await getToken('hasSeenTutorial');
        if (!seen) { setDemoMode(true); setTourActive(true); }
      } catch (e) {}
    })();
  }, []);

  // Sort a prioritized list by the chosen order.
  const applySort = useCallback((ranked) => {
    const byName = (a, b) => (a.priority.senderName || '').localeCompare(b.priority.senderName || '');
    const byDate = (a, b) => new Date(b.date) - new Date(a.date);
    const sorted = [...ranked];
    if (sortBy === 'date-desc') sorted.sort(byDate);
    else if (sortBy === 'date-asc') sorted.sort((a, b) => -byDate(a, b));
    else if (sortBy === 'name-asc') sorted.sort(byName);
    else if (sortBy === 'name-desc') sorted.sort((a, b) => -byName(a, b));
    return sorted; // 'importance' keeps the prioritize() order
  }, [sortBy]);

  // Build the prioritized, filtered, sorted list the UI shows.
  const emails = useMemo(() => {
    if (demoMode) return DEMO_EMAILS; // fake walkthrough inbox (already prioritized)
    const now = Date.now();
    const visible = raw
      // Keep the main inbox clean: only Inbox-folder Outlook mail (folder browsing
      // loads other folders too), plus any non-Outlook accounts. Honor the active
      // account filter ('all' shows every mailbox).
      .filter((e) => {
        const isOutlook = e.account === 'outlook';
        if (isOutlook && e.folder && e.folder !== 'inbox') return false;
        if (activeAccountId !== 'all' && isOutlook && e.accountId && e.accountId !== activeAccountId) return false;
        return true;
      })
      .map((e) => ({ ...e, ...(overrides[e.id] || {}), aiSummary: e.aiSummary || summaries[e.id] }))
      .filter((e) => {
        if (e.status === 'archived' || e.status === 'done') return false;
        if (e.snoozedUntil && e.snoozedUntil > now) return false;
        return true;
      });
    const ranked = prioritize(visible, vips, prefs.categories);
    return applySort(ranked);
  }, [raw, overrides, vips, summaries, sortBy, prefs.categories, demoMode, activeAccountId, applySort]);

  // The list for the currently-open folder (Junk, Archive, custom folders…).
  const folderEmails = useMemo(() => {
    if (!currentFolder) return null;
    const now = Date.now();
    const visible = raw
      .filter((e) => e.folder === currentFolder.id)
      .map((e) => ({ ...e, ...(overrides[e.id] || {}), aiSummary: e.aiSummary || summaries[e.id] }))
      .filter((e) => e.status !== 'archived' && e.status !== 'done' && !(e.snoozedUntil && e.snoozedUntil > now));
    return applySort(prioritize(visible, vips, prefs.categories));
  }, [raw, overrides, vips, summaries, prefs.categories, currentFolder, applySort]);

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

  // Snooze until a specific timestamp (used by the smart-snooze picker).
  const snoozeUntil = useCallback((id, ts, label = 'Snoozed') => {
    setOverride(id, { snoozedUntil: ts });
    setRecentAction({ id, label });
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
    // Skip anything the server already summarized (it attaches aiSummary to /inbox)
    // or that we've already cached — only fill the gaps, so we never double-bill.
    const todo = list.filter((e) => !e.aiSummary && !summariesRef.current[e.id]).slice(0, SUMMARIZE_CAP);
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
    // Use the token of the account this email belongs to (multi-account aware).
    const acc = mailAccounts.find((a) => a.id === target.accountId);
    const rt = acc?.refreshToken || outlookRefresh;
    try {
      const { body, bodyHtml, meeting, invite } = await fetchMessageBody(prefs.serverUrl, rt, id);
      setRaw((prev) => prev.map((e) => (
        e.id === id ? { ...e, body: body || e.body, bodyHtml: bodyHtml || '', meeting: meeting || null, invite: invite || null, fullBody: true } : e
      )));
    } catch (e) { /* keep the preview if the fetch fails */ }
  }, [raw, outlookRefresh, prefs.serverUrl, mailAccounts]);

  // Persist the linked-account list (keeps the legacy single token in sync too).
  const persistAccounts = useCallback(async (list) => {
    try { await saveToken('mail_accounts', JSON.stringify(list)); } catch (e) {}
    if (list[0]?.refreshToken) { try { await saveToken('outlook_refresh', list[0].refreshToken); } catch (e) {} }
  }, []);

  // Which accounts a load should touch, given the active scope.
  const accountsToLoad = useCallback(() => {
    if (mailAccounts.length) return activeAccountId === 'all' ? mailAccounts : mailAccounts.filter((a) => a.id === activeAccountId);
    return outlookRefresh ? [{ id: 'legacy', type: 'outlook', email: null, refreshToken: outlookRefresh }] : [];
  }, [mailAccounts, activeAccountId, outlookRefresh]);

  // Core loader: fetch each given account's inbox (page 1), tag by account, and
  // merge into raw — replacing only the loaded accounts' mail so others survive.
  const loadAccountsList = useCallback(async (targets) => {
    if (!targets || !targets.length) throw new Error('Outlook not connected');
    const all = [];
    for (const acc of targets) {
      try {
        const { emails: fetched, refreshToken: newRt, unreadCount, totalCount } =
          await fetchInbox(prefs.serverUrl, acc.refreshToken, 50, 'inbox', 0);
        if (newRt && newRt !== acc.refreshToken) {
          if (acc.id === 'legacy') { await saveToken('outlook_refresh', newRt); setOutlookRefresh(newRt); }
          else setMailAccounts((prev) => { const next = prev.map((a) => (a.id === acc.id ? { ...a, refreshToken: newRt } : a)); persistAccounts(next); return next; });
        }
        setAccountStats((s) => ({ ...s, [acc.id]: { unread: unreadCount ?? s[acc.id]?.unread ?? null, total: totalCount ?? s[acc.id]?.total ?? null } }));
        const tagged = fetched.map((e) => ({ ...e, accountId: acc.id, accountEmail: acc.email }));
        all.push(...tagged);
        summarizeBatch(tagged);
      } catch (e) { /* one account failing shouldn't kill the others */ }
    }
    const loaded = new Set(targets.map((a) => a.id));
    setRaw((prev) => {
      const others = prev.filter((e) => e.account !== 'outlook' || (e.accountId && !loaded.has(e.accountId)));
      return [...others, ...all];
    });
    targets.forEach((acc) => syncAllOutlook(acc));
  }, [prefs.serverUrl, summarizeBatch, persistAccounts]); // eslint-disable-line

  // Pull the latest Outlook inbox(es) for the active scope.
  const loadOutlook = useCallback(async () => {
    await loadAccountsList(accountsToLoad());
  }, [loadAccountsList, accountsToLoad]);

  // Background pagination per account: page back 50 at a time, appending as we go
  // (de-duped), until exhausted or a safety cap. Fetching is free; summaries cache.
  const syncAllOutlook = useCallback(async (acc) => {
    const rt = acc?.refreshToken || outlookRefresh;
    const accId = acc?.id || 'legacy';
    if (!rt) return;
    setSyncingAll(true);
    syncAbort.current = false;
    const CAP = 2000; // safety ceiling on how much we hold in memory per account
    try {
      let skip = 50; // page 0 already loaded
      while (skip < CAP && !syncAbort.current) {
        const { emails: page, hasMore } = await fetchInbox(prefs.serverUrl, rt, 50, 'inbox', skip);
        if (page && page.length) {
          const tagged = page.map((e) => ({ ...e, accountId: accId, accountEmail: acc?.email }));
          setRaw((prev) => {
            const seen = new Set(prev.map((e) => e.id));
            const add = tagged.filter((e) => !seen.has(e.id));
            return add.length ? [...prev, ...add] : prev;
          });
          // Deep backlog pages keep any cached summary the server attaches but we
          // don't request new AI summaries here — that keeps the bill bounded.
        }
        if (!hasMore || !page || page.length < 50) break;
        skip += 50;
      }
    } catch (e) { /* partial sync is fine — we keep what loaded */ }
    finally { setSyncingAll(false); }
  }, [outlookRefresh, prefs.serverUrl, summarizeBatch]);

  // Load the messages of a specific folder (Junk, Archive, custom…) into raw,
  // tagged with the folder id so the folder view (and only it) shows them.
  const openFolder = useCallback(async (folder) => {
    setCurrentFolder(folder);
    if (!folder) return;
    const acc = mailAccounts.find((a) => a.id === activeAccountId) || mailAccounts[0];
    const rt = acc?.refreshToken || outlookRefresh;
    if (!rt) return;
    setFolderLoading(true);
    try {
      const { emails: fetched } = await fetchInbox(prefs.serverUrl, rt, 50, null, 0, folder.id);
      // Tag with the owning account so opening a message uses the right token.
      const tagged = fetched.map((e) => ({ ...e, folder: folder.id, accountId: acc?.id, accountEmail: acc?.email }));
      setRaw((prev) => {
        const others = prev.filter((e) => e.folder !== folder.id);
        return [...others, ...tagged];
      });
      summarizeBatch(tagged);
    } catch (e) { /* leave previous */ } finally { setFolderLoading(false); }
  }, [mailAccounts, activeAccountId, outlookRefresh, prefs.serverUrl, summarizeBatch]);

  // Load the account's folder list for the drawer.
  const loadMailFolders = useCallback(async () => {
    const rt = (mailAccounts.find((a) => a.id === activeAccountId) || mailAccounts[0])?.refreshToken || outlookRefresh;
    if (!rt) return;
    setFoldersLoading(true);
    try {
      const { email, displayName, folders: fl } = await listFolders(prefs.serverUrl, rt);
      setMailFolders(fl || []);
      setFolderMeta({ email, displayName });
      // Backfill the active account's email if we didn't have it yet.
      if (email && activeAccountId !== 'all') {
        setMailAccounts((prev) => { const next = prev.map((a) => (a.id === activeAccountId && !a.email ? { ...a, email } : a)); persistAccounts(next); return next; });
      }
    } catch (e) { /* drawer just shows fewer folders */ } finally { setFoldersLoading(false); }
  }, [mailAccounts, activeAccountId, outlookRefresh, prefs.serverUrl, persistAccounts]);

  // Switch the active mailbox (or 'all' for the unified inbox) and reload.
  const switchMailAccount = useCallback((id) => {
    setActiveAccountId(id);
    setCurrentFolder(null);
    setMailFolders([]); setFolderMeta(null);
    const targets = id === 'all' ? mailAccounts : mailAccounts.filter((a) => a.id === id);
    setLoading(true);
    loadAccountsList(targets).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [mailAccounts, loadAccountsList]);

  // Add another linked Outlook mailbox (from a fresh sign-in) and load it.
  const addMailAccount = useCallback(async (refreshToken, emailArg) => {
    // Resolve which mailbox this is so we can dedupe by email — a reconnect (e.g.
    // to grant the calendar scope) returns a NEW refresh token for the SAME inbox,
    // and we must update it in place rather than show the mailbox twice.
    let email = emailArg || null;
    if (!email) { try { const r = await listFolders(prefs.serverUrl, refreshToken); email = r.email || null; } catch (e) { /* ignore */ } }
    // Compute synchronously from the latest accounts (a ref — NOT inside a setState
    // updater, which doesn't run in time to use `acc` below).
    const prev = mailAccountsRef.current || [];
    const existing = email && prev.find((a) => a.email && a.email.toLowerCase() === email.toLowerCase());
    let acc; let list;
    if (existing) {
      acc = { ...existing, refreshToken, email };
      list = prev.map((a) => (a.id === existing.id ? acc : a));
    } else if (prev.some((a) => a.refreshToken === refreshToken)) {
      acc = prev.find((a) => a.refreshToken === refreshToken);
      list = prev;
    } else {
      acc = { id: `outlook-${Date.now()}`, type: 'outlook', email, refreshToken };
      list = [...prev, acc];
    }
    mailAccountsRef.current = list;
    setMailAccounts(list);
    persistAccounts(list);
    setAccounts((a) => ({ ...a, outlook: true }));
    setActiveAccountId('all');
    setLoading(true);
    try { await loadAccountsList([acc]); } finally { setLoading(false); }
  }, [loadAccountsList, persistAccounts]);

  // Remove a linked mailbox.
  const removeMailAccount = useCallback(async (id) => {
    let list;
    setMailAccounts((prev) => { list = prev.filter((a) => a.id !== id); persistAccounts(list); return list; });
    setRaw((prev) => prev.filter((e) => e.accountId !== id));
    setAccountStats((s) => { const n = { ...s }; delete n[id]; return n; });
    setActiveAccountId((cur) => (cur === id ? 'all' : cur));
    if (!list || !list.length) { setAccounts((a) => ({ ...a, outlook: false })); setOutlookRefresh(null); try { await clearToken('outlook_refresh'); } catch (e) {} }
  }, [persistAccounts]);

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
      loadOutlook()
        .catch((e) => setError(e.message || 'Could not load mail'))
        .finally(() => setLoading(false));
    }
  }, [outlookRefresh, loadOutlook]);

  // Called after Microsoft login hands back a refresh token. Adds it as a linked
  // mailbox (the first one, or an additional account) and loads it.
  const connectOutlook = useCallback(async (refreshToken) => {
    setLoading(true);
    setError(null);
    try {
      setOutlookRefresh(refreshToken);
      setAccounts((a) => ({ ...a, outlook: true }));
      await addMailAccount(refreshToken);
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
    snoozeUntil,
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
    mailboxUnread,
    mailboxTotal,
    syncingAll,
    // Multi-account + folder browsing
    mailAccounts,
    activeAccountId,
    accountStats,
    switchMailAccount,
    addMailAccount,
    removeMailAccount,
    mailFolders,
    foldersLoading,
    loadMailFolders,
    folderMeta,
    openFolder,
    currentFolder,
    folderEmails,
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
