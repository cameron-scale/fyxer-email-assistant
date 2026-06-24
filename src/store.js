// store.js
// A tiny global "store" so every screen can read the inbox and trigger actions
// without passing props down through ten layers. Uses React Context — think of it
// as one shared box of data the whole app can reach into.

import React, {
  createContext, useContext, useCallback, useMemo, useState, useEffect, useRef,
} from 'react';
import { prioritize } from './lib/priority';
import { DEMO_EMAILS } from './lib/demo';
import { DEFAULT_TABS } from './lib/tabs';
import { fetchGmail } from './api/gmail';
import {
  fetchInbox, fetchMessageBody, summarizeEmails, searchMail, askMail, setMyPhoto,
  listFolders, mailAction, learnFromKeep, isBackendConfigured, DEFAULT_SERVER_URL,
} from './lib/backend';
import { saveToken, getToken, clearToken } from './lib/storage';
import { Alert } from 'react-native';

// How sorting works. "importance" defers to the on-device priority engine.
export const SORTS = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'name-asc': 'Sender A–Z',
  'name-desc': 'Sender Z–A',
  importance: 'Importance',
};
// How many fresh emails to auto-summarize per load (bounds AI cost).
const SUMMARIZE_CAP = 50; // AI summaries generated per request / per box page

const DEFAULT_PREFS = { tone: 'professional', signature: 'Cameron', serverUrl: DEFAULT_SERVER_URL, sig: null, categories: [], photoGallery: [], avatarUri: null, groupThreads: true, tabs: DEFAULT_TABS, tabHintSeen: false, learnedInbox: false, knownImportant: [], archiveKept: [], archiveStaged: {}, senderNotes: {}, senderLabels: {}, keptSenders: {}, hiddenIds: {}, autoArchive: true, archiveNoticeSeen: false };

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  // Raw emails — empty until a real account is connected.
  const [raw, setRaw] = useState([]);
  const rawRef = useRef([]);
  useEffect(() => { rawRef.current = raw; }, [raw]);
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Per-email local state the user creates: archived / snoozed / done / read.
  const [overrides, setOverrides] = useState({}); // id -> { status, read, snoozedUntil }

  // The most recent reversible action, powering the Undo snackbar.
  const [recentAction, setRecentAction] = useState(null); // { id | ids, label, durationMs }
  const undoLastRef = useRef(null); // so the sweep effect can offer Undo before undoLast is declared

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
  // Ids we've already SENT to summarize — so a message is summarized exactly once
  // (the AI is non-deterministic; without this the text flickers as raw churns).
  const requestedRef = useRef(new Set());

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

  // True once saved prefs/tokens have loaded — so first-launch gating doesn't flash.
  const [bootstrapped, setBootstrapped] = useState(false);

  // The full-screen "learn my inbox" overlay (ring → frosted "Inbox ready" popup).
  const [learnOpen, setLearnOpen] = useState(false);
  const openLearn = useCallback(() => setLearnOpen(true), []);
  const closeLearn = useCallback(() => setLearnOpen(false), []);

  // Load saved VIPs + prefs + tokens once when the app starts.
  useEffect(() => {
    // Wake the backend immediately (Render free tier sleeps after inactivity) so
    // its cold start overlaps with loading tokens instead of blocking the inbox.
    fetch(`${DEFAULT_SERVER_URL}/health`).catch(() => {});
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
          // outlookRefresh is the Outlook-path fallback token — only an Outlook one.
          const firstOutlook = list.find((a) => (a.type || 'outlook') === 'outlook');
          if (firstOutlook) setOutlookRefresh(firstOutlook.refreshToken);
          setAccounts((a) => ({
            ...a,
            outlook: list.some((x) => (x.type || 'outlook') === 'outlook'),
            gmail: list.some((x) => x.type === 'google'),
          }));
          await saveToken('mail_accounts', JSON.stringify(list));
        } else if (rt) {
          setOutlookRefresh(rt);
          setAccounts((a) => ({ ...a, outlook: true }));
        }
        // Hydrate the inbox from the on-device snapshot so mail shows INSTANTLY,
        // before the (possibly cold) server responds. The live fetch replaces it.
        try {
          const cache = await getToken('inbox_cache');
          if (cache) {
            const arr = JSON.parse(cache);
            if (Array.isArray(arr) && arr.length) {
              const knownIds = new Set(list.map((a) => a.id));
              if (rt) knownIds.add('legacy');
              const keep = arr.filter((e) => !e.accountId || knownIds.has(e.accountId));
              if (keep.length) { setRaw(keep); rawRef.current = keep; }
            }
          }
        } catch (e) { /* no cache yet */ }
        // First-ever launch → run the tutorial with demo data (only once the new
        // onboarding flow has been completed, so they don't overlap on a fresh install).
        const seen = await getToken('hasSeenTutorial');
        const onboarded = (() => { try { return !!JSON.parse(p || '{}').hasSeenOnboarding; } catch (e) { return false; } })();
        if (!seen && onboarded) { setDemoMode(true); setTourActive(true); }
      } catch (e) {}
      finally { setBootstrapped(true); }
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

  // Learned-important senders, scoped to the current account view. Stored as a map
  // { accountId: [emails] } so learning one mailbox never bleeds into another. An
  // older array value is treated as a legacy global list (applies everywhere).
  const knownImportantList = useMemo(() => {
    const ki = prefs.knownImportant;
    if (Array.isArray(ki)) return ki;
    if (!ki || typeof ki !== 'object') return [];
    if (activeAccountId === 'all') return Array.from(new Set(Object.values(ki).flat()));
    return ki[activeAccountId] || [];
  }, [prefs.knownImportant, activeAccountId]);

  // Sender classifications from the Classify button: { email -> important|junk|
  // newsletter|client|vendor|coworker|employee } — feeds the priority engine.
  const senderLabels = useMemo(() => prefs.senderLabels || {}, [prefs.senderLabels]);

  // Learned from "Keep": senders whose mail you've rescued from auto-archive.
  const keptSenders = useMemo(() => prefs.keptSenders || {}, [prefs.keptSenders]);

  // Build the prioritized, filtered, sorted list the UI shows. We split this into
  // two passes so AI summaries arriving (which happens constantly) don't re-run the
  // expensive regex scoring over the whole mailbox:
  //  1) rankedBase — filter + prioritize + sort. Recomputes only when mail / prefs
  //     change (NOT when a summary lands).
  //  2) emails — cheaply attach each summary on top, keeping the SAME object
  //     reference for un-summarized rows so memoized cards don't re-render.
  const rankedBase = useMemo(() => {
    if (demoMode) return DEMO_EMAILS;
    const now = Date.now();
    const hidden = prefs.hiddenIds || {};
    const visible = raw
      .filter((e) => {
        const isMailbox = e.account === 'outlook' || e.account === 'gmail' || e.account === 'icloud';
        if (isMailbox && e.folder && e.folder !== 'inbox') return false;
        if (activeAccountId !== 'all' && isMailbox && e.accountId && e.accountId !== activeAccountId) return false;
        if (hidden[e.id]) return false; // archived/trashed earlier — stay gone across reloads
        return true;
      })
      .map((e) => ({ ...e, ...(overrides[e.id] || {}) }))
      .filter((e) => {
        if (e.status === 'archived' || e.status === 'done') return false;
        if (e.snoozedUntil && e.snoozedUntil > now) return false;
        return true;
      });
    // De-dupe by id — overlapping background-sync pages can append the same email
    // twice, which showed up as a repeated card (notably in Triage).
    const seen = new Set();
    const deduped = visible.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
    return applySort(prioritize(deduped, vips, prefs.categories, knownImportantList, senderLabels, keptSenders));
  }, [raw, overrides, vips, sortBy, prefs.categories, prefs.knownImportant, prefs.senderLabels, prefs.keptSenders, prefs.hiddenIds, demoMode, activeAccountId, applySort]); // eslint-disable-line

  const emails = useMemo(() => {
    if (demoMode) return rankedBase;
    return rankedBase.map((e) => {
      const sum = e.aiSummary || summaries[e.id];
      if (!sum || (e.aiSummary === sum && e.priority.aiSummarized)) return e; // unchanged ref → no re-render
      return { ...e, aiSummary: sum, priority: { ...e.priority, tldr: sum, aiSummarized: true } };
    });
  }, [rankedBase, summaries, demoMode]);

  // The list for the currently-open folder (Junk, Archive, custom folders…).
  const folderEmails = useMemo(() => {
    if (!currentFolder) return null;
    const now = Date.now();
    const visible = raw
      .filter((e) => e.folder === currentFolder.id)
      .map((e) => ({ ...e, ...(overrides[e.id] || {}), aiSummary: e.aiSummary || summaries[e.id] }))
      .filter((e) => e.status !== 'archived' && e.status !== 'done' && !(e.snoozedUntil && e.snoozedUntil > now));
    return applySort(prioritize(visible, vips, prefs.categories, knownImportantList, senderLabels, keptSenders));
  }, [raw, overrides, vips, summaries, prefs.categories, prefs.knownImportant, prefs.senderLabels, prefs.keptSenders, currentFolder, applySort]);

  // Prioritized view of whole-mailbox search results (null when not searching).
  const searchEmails = useMemo(() => {
    if (!searchResults) return null;
    const merged = searchResults.map((e) => ({
      ...e, ...(overrides[e.id] || {}), aiSummary: e.aiSummary || summaries[e.id],
    }));
    return prioritize(merged, vips, prefs.categories, knownImportantList, senderLabels, keptSenders);
  }, [searchResults, overrides, summaries, vips, prefs.categories, prefs.knownImportant, prefs.senderLabels, prefs.keptSenders]);

  // Prioritized Sent / Drafts lists (loaded on demand for those tabs).
  const sentRanked = useMemo(() => prioritize((folders.sent || []).map((e) => ({ ...e, ...(overrides[e.id] || {}) })), vips, prefs.categories, knownImportantList, senderLabels, keptSenders), [folders.sent, overrides, vips, prefs.categories, knownImportantList, senderLabels]);
  const draftRanked = useMemo(() => prioritize((folders.drafts || []).map((e) => ({ ...e, ...(overrides[e.id] || {}) })), vips, prefs.categories, knownImportantList, senderLabels, keptSenders), [folders.drafts, overrides, vips, prefs.categories, knownImportantList, senderLabels]);

  // Find a prioritized email by id across EVERY loaded list (inbox, folders,
  // Sent, Drafts, search) so the reader works no matter which box it was opened from.
  const findEmail = useCallback((id) => {
    if (!id) return null;
    const lists = [emails, searchEmails, folderEmails, sentRanked, draftRanked];
    for (const l of lists) { const hit = (l || []).find((e) => e.id === id); if (hit) return hit; }
    return null;
  }, [emails, searchEmails, folderEmails, sentRanked, draftRanked]);

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

  // Persist a swipe/button action to the real mailbox (Outlook or Gmail), using
  // the token + provider of the account the email belongs to. Best-effort.
  const persistAction = useCallback((id, action) => {
    const e = (rawRef.current || []).find((x) => x.id === id);
    if (!e || (e.account !== 'outlook' && e.account !== 'gmail' && e.account !== 'icloud')) return;
    const acc = (mailAccountsRef.current || []).find((a) => a.id === e.accountId);
    const rt = acc?.refreshToken || outlookRefresh;
    const provider = acc?.type || (e.account === 'gmail' ? 'google' : 'outlook');
    if (rt) mailAction(prefs.serverUrl, rt, id, action, provider).catch(() => {});
  }, [outlookRefresh, prefs.serverUrl]);

  // Persist which emails have left the inbox (archived/trashed/junked/done) so they
  // stay gone after a reload — even if the server move didn't go through (e.g. an
  // Outlook account still pending the Mail.ReadWrite reconnect). Undo un-hides them.
  const hideIds = useCallback((ids) => {
    const list = (ids || []).filter(Boolean);
    if (!list.length) return;
    setPrefsState((p) => {
      const hidden = { ...(p.hiddenIds || {}) };
      list.forEach((id) => { hidden[id] = 1; });
      const next = { ...p, hiddenIds: hidden };
      saveToken('prefs', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const unhideIds = useCallback((ids) => {
    const list = (ids || []).filter(Boolean);
    if (!list.length) return;
    setPrefsState((p) => {
      const hidden = { ...(p.hiddenIds || {}) };
      let changed = false;
      list.forEach((id) => { if (hidden[id]) { delete hidden[id]; changed = true; } });
      if (!changed) return p;
      const next = { ...p, hiddenIds: hidden };
      saveToken('prefs', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // --- Actions used by swipes / buttons (each records an undoable "recent action") ---
  const archive = useCallback((id) => {
    setOverride(id, { status: 'archived' });
    setRecentAction({ id, label: 'Archived' });
    persistAction(id, 'archive');
    hideIds([id]);
  }, [setOverride, persistAction, hideIds]);

  const markDone = useCallback((id) => {
    setOverride(id, { status: 'done' });
    setRecentAction({ id, label: 'Marked done' });
    persistAction(id, 'read'); // "done" also marks it read in the mailbox
    hideIds([id]);
  }, [setOverride, persistAction, hideIds]);

  const markRead = useCallback((id) => {
    setOverride(id, { read: true });
    persistAction(id, 'read');
    // Opening a staged email resets its 7-day "archiving soon" countdown.
    setPrefsState((p) => {
      if (!p.archiveStaged || !p.archiveStaged[id]) return p;
      const next = { ...p, archiveStaged: { ...p.archiveStaged, [id]: Date.now() } };
      saveToken('prefs', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [setOverride, persistAction]);

  const markUnread = useCallback((id) => {
    setOverride(id, { read: false });
    setRecentAction({ id, label: 'Marked unread' });
    persistAction(id, 'unread');
    unhideIds([id]); // marking unread brings it back to the inbox
  }, [setOverride, persistAction, unhideIds]);

  const trashEmail = useCallback((id) => {
    setOverride(id, { status: 'archived' }); // hide from the list
    setRecentAction({ id, label: 'Deleted' });
    persistAction(id, 'trash');
    hideIds([id]);
  }, [setOverride, persistAction, hideIds]);

  // Report as junk / spam: move it to the Junk folder and hide it.
  const reportJunk = useCallback((id) => {
    setOverride(id, { status: 'archived' });
    setRecentAction({ id, label: 'Reported as junk' });
    persistAction(id, 'junk');
    hideIds([id]);
  }, [setOverride, persistAction, hideIds]);

  // Apply an action to many emails at once (multi-select bulk actions).
  const bulkAction = useCallback((ids, action) => {
    (ids || []).forEach((id) => {
      if (action === 'archive') { setOverride(id, { status: 'archived' }); persistAction(id, 'archive'); }
      else if (action === 'trash') { setOverride(id, { status: 'archived' }); persistAction(id, 'trash'); }
      else if (action === 'junk') { setOverride(id, { status: 'archived' }); persistAction(id, 'junk'); }
      else if (action === 'read') { setOverride(id, { read: true }); persistAction(id, 'read'); }
      else if (action === 'unread') { setOverride(id, { read: false }); persistAction(id, 'unread'); }
    });
    if (action === 'archive' || action === 'trash' || action === 'junk') hideIds(ids);
    setRecentAction(null);
  }, [setOverride, persistAction, hideIds]);

  // ── "Archiving Soon" — a passive, high-confidence auto-archive queue ─────────
  // Low-priority bulk mail (the 'noise' bucket: newsletters/promos/notifications)
  // auto-archives. An email becomes eligible once it's 7+ days old, and a nightly
  // sweep at 11:59 PM archives everything eligible (unless you keep it). The sweep
  // runs client-side — it fires while the app is open at 11:59, and catches up the
  // next time you open the app after a missed night (no server cron needed).
  const ARCHIVE_AGE = 7 * 24 * 3600 * 1000;
  const archiveKeptSet = useMemo(() => new Set((prefs.archiveKept || []).map(String)), [prefs.archiveKept]);
  const gone = (id) => { const ov = overrides[id]; return !!ov && (ov.status === 'archived' || ov.status === 'done'); };

  // Eligible = low-priority mail that's already 7+ days old and not kept. These are
  // the emails the next nightly sweep will archive.
  const archivingSoon = useMemo(
    () => {
      const cutoff = Date.now() - ARCHIVE_AGE;
      return emails.filter((e) =>
        e.priority.bucket === 'noise' && !archiveKeptSet.has(e.id) && new Date(e.date).getTime() <= cutoff);
    },
    [emails, archiveKeptSet],
  );
  // The banner count comes from a PERSISTENT set of eligible ids (prefs.archiveStaged),
  // not the currently-loaded slice — otherwise it jumps every refresh as different
  // pages load. Ids only leave when kept, archived, or swept.
  const archivingSoonCount = useMemo(
    () => Object.keys(prefs.archiveStaged || {}).filter((id) => !archiveKeptSet.has(id) && !gone(id)).length,
    [prefs.archiveStaged, archiveKeptSet, overrides],
  );

  // Most recent / next 11:59 PM local boundary, for the sweep + the countdown.
  const lastNightly = () => { const n = new Date(); const b = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 0, 0); if (n.getTime() < b.getTime()) b.setDate(b.getDate() - 1); return b.getTime(); };

  // Keep the persistent eligible-id set in sync with what we've seen (stable count).
  useEffect(() => {
    const staged = { ...(prefs.archiveStaged || {}) };
    const now = Date.now();
    let changed = false;
    for (const e of archivingSoon) { if (!staged[e.id]) { staged[e.id] = now; changed = true; } }
    for (const id of Object.keys(staged)) { if (archiveKeptSet.has(id) || gone(id)) { delete staged[id]; changed = true; } }
    if (changed) setPrefsState((p) => { const next = { ...p, archiveStaged: staged }; saveToken('prefs', JSON.stringify(next)).catch(() => {}); return next; });
  }, [archivingSoon, archiveKeptSet, overrides]); // eslint-disable-line

  // Nightly sweep: archive every eligible email at 11:59 PM (catching up on next open).
  // Auto-archive only MOVES mail to the Archive folder — it never deletes — and you
  // can switch it off entirely (prefs.autoArchive). Each sweep is undoable.
  useEffect(() => {
    if (prefs.autoArchive === false) return; // user turned it off → never sweep
    const sweep = () => {
      const boundary = lastNightly();
      const last = prefs.archiveLastRun;
      // First run ever: seed the marker to the current boundary so we don't archive
      // everything on launch — the first real sweep happens at the upcoming 11:59 PM.
      if (last == null) {
        setPrefsState((p) => { const next = { ...p, archiveLastRun: boundary }; saveToken('prefs', JSON.stringify(next)).catch(() => {}); return next; });
        return;
      }
      if (last >= boundary) return; // already swept for this night
      const ids = archivingSoon.map((e) => e.id);
      if (ids.length) {
        bulkAction(ids, 'archive');
        // Offer an undo for the whole batch, and explain it once (it's recoverable).
        setRecentAction({ ids, label: `Archived ${ids.length} older email${ids.length === 1 ? '' : 's'}`, durationMs: 8000 });
        if (!prefs.archiveNoticeSeen) {
          Alert.alert(
            'Older mail tidied into Archive',
            `ScaleMail filed ${ids.length} low-priority email${ids.length === 1 ? '' : 's'} (7+ days old) into your Archive folder. Nothing is deleted — it's all searchable and you can move anything back anytime. This runs automatically at 11:59 PM.`,
            [
              { text: 'Turn off', style: 'destructive', onPress: () => setPrefs({ autoArchive: false }) },
              { text: 'Undo', onPress: () => undoLastRef.current && undoLastRef.current() },
              { text: 'Keep it on', style: 'cancel' },
            ],
          );
        }
      }
      setPrefsState((p) => {
        const staged = { ...(p.archiveStaged || {}) };
        for (const id of ids) delete staged[id];
        const next = { ...p, archiveStaged: staged, archiveLastRun: Date.now(), archiveNoticeSeen: true };
        saveToken('prefs', JSON.stringify(next)).catch(() => {});
        return next;
      });
    };
    sweep();
    const t = setInterval(sweep, 60 * 1000); // re-check every minute while open
    return () => clearInterval(t);
  }, [archivingSoon, prefs.archiveLastRun, prefs.autoArchive]); // eslint-disable-line

  // Keeping an email teaches the engine: never archive THIS one (archiveKept), and
  // remember the SENDER so similar mail stops getting auto-archived and ranks up
  // (keptSenders, +1 each time). We also ask the AI to read it and infer WHY you
  // kept it; if it reads as a real relationship/important sender, we apply that
  // classification so future actions adjust automatically. Best-effort.
  const keepFromArchive = useCallback((id) => {
    const e = findEmail(id);
    const addr = (e?.priority?.senderEmail || '').toLowerCase();
    setPrefsState((p) => {
      const kept = { ...(p.keptSenders || {}) };
      if (addr) kept[addr] = (kept[addr] || 0) + 1;
      const next = {
        ...p,
        archiveKept: Array.from(new Set([...(p.archiveKept || []), id])),
        keptSenders: kept,
      };
      saveToken('prefs', JSON.stringify(next)).catch(() => {});
      return next;
    });
    // AI: read the kept email and learn why (best-effort, never blocks the UI).
    if (e && addr && isBackendConfigured(prefs.serverUrl)) {
      learnFromKeep(prefs.serverUrl, {
        from: e.from, subject: e.subject,
        preview: e.aiSummary || e.priority?.tldr || e.preview || e.body || '',
        category: e.priority?.category,
      }).then((r) => {
        if (!r) return;
        setPrefsState((p) => {
          const next = { ...p };
          let changed = false;
          if (r.reason) { next.senderNotes = { ...(p.senderNotes || {}), [addr]: r.reason }; changed = true; }
          // Only auto-apply a relationship/important label, and never overwrite a
          // label you set yourself.
          const ok = ['important', 'client', 'vendor', 'coworker', 'employee'];
          if (r.label && ok.includes(r.label) && !(p.senderLabels || {})[addr]) {
            next.senderLabels = { ...(p.senderLabels || {}), [addr]: r.label }; changed = true;
          }
          if (!changed) return p;
          saveToken('prefs', JSON.stringify(next)).catch(() => {});
          return next;
        });
      }).catch(() => {});
    }
  }, [findEmail, prefs.serverUrl]);
  const archiveStagedNow = useCallback((ids) => {
    const list = ids || archivingSoon.map((e) => e.id);
    bulkAction(list, 'archive');
  }, [archivingSoon, bulkAction]);

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
      if (!cur) return null;
      if (cur.ids && cur.ids.length) {
        // Batch auto-archive undo: restore on the server AND keep them out of future
        // sweeps (undoing means "I want to hold onto these").
        cur.ids.forEach((id) => { setOverride(id, { status: undefined }); persistAction(id, 'inbox'); });
        unhideIds(cur.ids);
        setPrefsState((p) => {
          const kept = Array.from(new Set([...(p.archiveKept || []), ...cur.ids]));
          const next = { ...p, archiveKept: kept };
          saveToken('prefs', JSON.stringify(next)).catch(() => {});
          return next;
        });
      } else if (cur.id != null) {
        setOverride(cur.id, { status: undefined, snoozedUntil: undefined });
        unhideIds([cur.id]);
      }
      return null;
    });
  }, [setOverride, persistAction, unhideIds]);
  undoLastRef.current = undoLast;

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
    // Only fill gaps: skip already-summarized AND anything already requested this
    // session, so each message is summarized exactly once (no flickering text).
    const todo = list.filter((e) => (
      e.id && !e.aiSummary && !summariesRef.current[e.id] && !requestedRef.current.has(e.id)
    )).slice(0, SUMMARIZE_CAP);
    if (!todo.length) return;
    todo.forEach((e) => requestedRef.current.add(e.id));
    for (let i = 0; i < todo.length; i += 15) {
      const chunk = todo.slice(i, i + 15);
      try {
        const { summaries: got } = await summarizeEmails(
          prefs.serverUrl,
          chunk.map((e) => ({ id: e.id, from: e.from, subject: e.subject, preview: e.body })),
        );
        if (got && Object.keys(got).length) setSummaries((s) => ({ ...s, ...got }));
      } catch (e) {
        // Allow a retry later if the request failed.
        chunk.forEach((x) => requestedRef.current.delete(x.id));
      }
    }
  }, [prefs.serverUrl]);

  // Load the full body of one email on demand (the list only carries a preview).
  // Keeps the stripped text for priority/summary, plus sanitized HTML + any
  // detected meeting link for rich display.
  const loadFullBody = useCallback(async (id) => {
    const target = raw.find((e) => e.id === id);
    if (!target || (target.account !== 'outlook' && target.account !== 'gmail' && target.account !== 'icloud') || target.fullBody) return;
    // Use the token + provider of the account this email belongs to.
    const acc = mailAccounts.find((a) => a.id === target.accountId);
    const rt = acc?.refreshToken || outlookRefresh;
    const provider = acc?.type || (target.account === 'gmail' ? 'google' : 'outlook');
    try {
      const { body, bodyHtml, meeting, invite, attachments } = await fetchMessageBody(prefs.serverUrl, rt, id, provider);
      setRaw((prev) => prev.map((e) => (
        e.id === id ? { ...e, body: body || e.body, bodyHtml: bodyHtml || '', meeting: meeting || null, invite: invite || null, attachments: attachments || [], fullBody: true } : e
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
  // Persist a small snapshot of the inbox so it appears INSTANTLY on the next
  // launch (stale-while-revalidate) instead of waiting on the server's cold start.
  // Envelope-only (no bodies) and capped, to stay tiny in the keychain.
  const cacheInbox = useCallback(() => {
    try {
      const snap = (rawRef.current || [])
        .filter((e) => (!e.folder || e.folder === 'inbox') && e.account !== 'demo')
        .slice(0, 30)
        .map((e) => ({
          id: e.id, account: e.account, accountId: e.accountId, accountEmail: e.accountEmail,
          from: e.from, subject: e.subject, preview: e.preview, date: e.date,
          read: e.read, flagged: e.flagged, threadKey: e.threadKey, threadCount: e.threadCount,
          inferred: e.inferred,
          aiSummary: e.aiSummary || summariesRef.current[e.id] || undefined,
        }));
      saveToken('inbox_cache', JSON.stringify(snap)).catch(() => {});
    } catch (e) { /* cache is best-effort */ }
  }, []);

  const loadAccountsList = useCallback(async (targets) => {
    if (!targets || !targets.length) throw new Error('Outlook not connected');
    // Load every account IN PARALLEL and append each one's mail the moment it
    // arrives, so the inbox populates progressively instead of waiting for all
    // accounts (and the slowest cold-start) to finish.
    await Promise.all(targets.map(async (acc) => {
      try {
        const provider = acc.type || 'outlook';
        const { emails: fetched, refreshToken: newRt, unreadCount, totalCount } =
          await fetchInbox(prefs.serverUrl, acc.refreshToken, 50, 'inbox', 0, null, provider);
        if (newRt && newRt !== acc.refreshToken) {
          if (acc.id === 'legacy') { await saveToken('outlook_refresh', newRt); setOutlookRefresh(newRt); }
          else setMailAccounts((prev) => { const next = prev.map((a) => (a.id === acc.id ? { ...a, refreshToken: newRt } : a)); persistAccounts(next); return next; });
        }
        setAccountStats((s) => ({ ...s, [acc.id]: { unread: unreadCount ?? s[acc.id]?.unread ?? null, total: totalCount ?? s[acc.id]?.total ?? null } }));
        const tagged = fetched.map((e) => ({ ...e, accountId: acc.id, accountEmail: acc.email }));
        // Replace just this account's mail (keeps other accounts/folders intact).
        setRaw((prev) => [...prev.filter((e) => e.accountId !== acc.id), ...tagged]);
        summarizeBatch(tagged);
      } catch (e) { /* one account failing shouldn't kill the others */ }
    }));
    // Only Outlook supports deep skip-based background pagination today.
    targets.filter((a) => (a.type || 'outlook') === 'outlook').forEach((acc) => syncAllOutlook(acc));
    // Snapshot the freshly-loaded inbox for an instant cold start next time (and
    // again shortly after, once AI summaries have filled in).
    cacheInbox();
    setTimeout(cacheInbox, 4000);
  }, [prefs.serverUrl, summarizeBatch, persistAccounts, cacheInbox]); // eslint-disable-line

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
      const { emails: fetched } = await fetchInbox(prefs.serverUrl, rt, 50, null, 0, folder.id, acc?.type || 'outlook');
      // Tag with the owning account so opening a message uses the right token.
      const tagged = fetched.map((e) => ({ ...e, folder: folder.id, accountId: acc?.id, accountEmail: acc?.email }));
      setRaw((prev) => {
        const others = prev.filter((e) => e.folder !== folder.id);
        return [...others, ...tagged];
      });
      summarizeBatch(tagged);
    } catch (e) { /* leave previous */ } finally { setFolderLoading(false); }
  }, [mailAccounts, activeAccountId, outlookRefresh, prefs.serverUrl, summarizeBatch]);

  // Open a well-known folder (Archive / Junk) from a tab-bar tab. Mirrors the
  // server's well-known → real-folder mapping so folderEmails matches.
  const openWellKnownFolder = useCallback(async (wellKey, name) => {
    const WK_RESULT = { archive: 'archive', junk: 'junkemail' };
    const folderId = WK_RESULT[wellKey] || wellKey;
    setCurrentFolder({ id: folderId, name });
    const acc = mailAccounts.find((a) => a.id === activeAccountId) || mailAccounts[0];
    const rt = acc?.refreshToken || outlookRefresh;
    if (!rt) return;
    setFolderLoading(true);
    try {
      const { emails: fetched } = await fetchInbox(prefs.serverUrl, rt, 50, wellKey, 0, null, acc?.type || 'outlook');
      const tagged = fetched.map((e) => ({ ...e, folder: folderId, accountId: acc?.id, accountEmail: acc?.email }));
      setRaw((prev) => [...prev.filter((e) => e.folder !== folderId), ...tagged]);
      summarizeBatch(tagged);
    } catch (e) { /* leave previous */ } finally { setFolderLoading(false); }
  }, [mailAccounts, activeAccountId, outlookRefresh, prefs.serverUrl, summarizeBatch]);

  // Load the account's folder list for the drawer.
  const loadMailFolders = useCallback(async () => {
    // For the unified "All Inboxes" view, prefer the Outlook account so the user
    // sees their (richest) Microsoft folder tree; otherwise use the active account.
    const acc = activeAccountId === 'all'
      ? (mailAccounts.find((a) => (a.type || 'outlook') === 'outlook') || mailAccounts[0])
      : (mailAccounts.find((a) => a.id === activeAccountId) || mailAccounts[0]);
    const rt = acc?.refreshToken || outlookRefresh;
    if (!rt) return;
    setFoldersLoading(true);
    try {
      const { email, displayName, folders: fl } = await listFolders(prefs.serverUrl, rt, acc?.type || 'outlook');
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

  // Add another linked mailbox (Outlook or Gmail) from a fresh sign-in and load it.
  const addMailAccount = useCallback(async (refreshToken, emailArg, type = 'outlook') => {
    // Resolve which mailbox this is so we can dedupe by email — a reconnect (e.g.
    // to grant the calendar scope) returns a NEW refresh token for the SAME inbox,
    // and we must update it in place rather than show the mailbox twice.
    let email = emailArg || null;
    if (!email) { try { const r = await listFolders(prefs.serverUrl, refreshToken, type); email = r.email || null; } catch (e) { /* ignore */ } }
    // Compute synchronously from the latest accounts (a ref — NOT inside a setState
    // updater, which doesn't run in time to use `acc` below).
    const prev = mailAccountsRef.current || [];
    const existing = email && prev.find((a) => a.type === type && a.email && a.email.toLowerCase() === email.toLowerCase());
    let acc; let list;
    if (existing) {
      acc = { ...existing, refreshToken, email };
      list = prev.map((a) => (a.id === existing.id ? acc : a));
    } else if (prev.some((a) => a.refreshToken === refreshToken)) {
      acc = prev.find((a) => a.refreshToken === refreshToken);
      list = prev;
    } else {
      acc = { id: `${type}-${Date.now()}`, type, email, refreshToken };
      list = [...prev, acc];
    }
    mailAccountsRef.current = list;
    setMailAccounts(list);
    persistAccounts(list);
    const flag = type === 'google' ? 'gmail' : type === 'icloud' ? 'icloud' : 'outlook';
    setAccounts((a) => ({ ...a, [flag]: true }));
    setActiveAccountId('all');
    setLoading(true);
    try { await loadAccountsList([acc]); } finally { setLoading(false); }
  }, [loadAccountsList, persistAccounts]);

  // Merge learned-important senders into a specific account's bucket (per-account,
  // so learning one mailbox never affects another). Uses functional setPrefs.
  const addKnownImportant = useCallback((accountId, emails) => {
    const clean = (emails || []).map((e) => String(e || '').toLowerCase().trim()).filter((e) => e.includes('@'));
    if (!clean.length) return;
    const key = accountId || 'legacy';
    setPrefsState((prev) => {
      const cur = prev.knownImportant;
      const map = (cur && !Array.isArray(cur) && typeof cur === 'object') ? { ...cur }
        : (Array.isArray(cur) && cur.length ? { all: cur } : {}); // migrate legacy array
      map[key] = Array.from(new Set([...(map[key] || []), ...clean]));
      const next = { ...prev, knownImportant: map };
      saveToken('prefs', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Classify the senders of the given emails (important | junk | newsletter |
  // client | vendor | coworker | employee). This teaches the priority engine how to
  // treat current AND future mail from them. 'junk' also moves the selected mail to
  // Junk right now. Returns the number of distinct senders labeled.
  const classifySenders = useCallback((ids, label) => {
    const picked = (ids || []).map((id) => findEmail(id)).filter(Boolean);
    const addrs = Array.from(new Set(picked.map((e) => (e.priority?.senderEmail || '').toLowerCase()).filter(Boolean)));
    if (addrs.length) {
      setPrefsState((p) => {
        const next = { ...p, senderLabels: { ...(p.senderLabels || {}) } };
        addrs.forEach((a) => { next.senderLabels[a] = label; });
        saveToken('prefs', JSON.stringify(next)).catch(() => {});
        return next;
      });
    }
    if (label === 'junk' && ids?.length) bulkAction(ids, 'junk');
    return addrs.length;
  }, [findEmail, bulkAction]);

  // Rename / tag a linked mailbox (custom display name + accent color).
  const updateMailAccount = useCallback((id, patch) => {
    setMailAccounts((prev) => { const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a)); persistAccounts(next); mailAccountsRef.current = next; return next; });
  }, [persistAccounts]);

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
    const hasAccounts = (outlookRefresh || (mailAccounts && mailAccounts.length));
    if (hasAccounts && !didInitialLoad.current) {
      didInitialLoad.current = true;
      setLoading(true);
      loadOutlook()
        .catch((e) => setError(e.message || 'Could not load mail'))
        .finally(() => setLoading(false));
    }
  }, [outlookRefresh, mailAccounts, loadOutlook]);

  // Called after Microsoft login hands back a refresh token. Adds it as a linked
  // mailbox (the first one, or an additional account) and loads it.
  const connectOutlook = useCallback(async (refreshToken) => {
    setLoading(true);
    setError(null);
    try {
      setOutlookRefresh(refreshToken);
      setAccounts((a) => ({ ...a, outlook: true }));
      await addMailAccount(refreshToken, null, 'outlook');
    } catch (e) {
      setError(e.message || 'Could not load Outlook mail');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [addMailAccount]);

  // Called after Google login hands back a refresh token (backend flow). Links
  // the Gmail mailbox into the same multi-account model as Outlook.
  const connectGoogle = useCallback(async (refreshToken) => {
    setLoading(true);
    setError(null);
    try {
      await addMailAccount(refreshToken, null, 'google');
    } catch (e) {
      setError(e.message || 'Could not load Gmail');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [addMailAccount]);

  // Link an iCloud mailbox (IMAP/SMTP). `email` + app-specific `password` are
  // packed into the account's token slot as JSON so the rest of the plumbing works.
  const connectIcloud = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const token = JSON.stringify({ email: String(email).trim(), password: String(password).trim() });
      await addMailAccount(token, String(email).trim(), 'icloud');
    } catch (e) {
      setError(e.message || 'Could not load iCloud');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [addMailAccount]);

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

  // Pull-to-refresh: re-fetch every linked mailbox (Outlook + Gmail) for the
  // active scope — they all go through the unified backend loader now.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if ((mailAccountsRef.current && mailAccountsRef.current.length) || outlookRefresh) await loadOutlook();
    } catch (e) {
      setError(e.message || 'Refresh failed');
    } finally {
      setLoading(false);
    }
  }, [outlookRefresh, loadOutlook]);

  const disconnect = useCallback(async (provider) => {
    if (provider === 'outlook') { await clearToken('outlook_refresh'); setOutlookRefresh(null); }
    else if (provider === 'gmail') { await clearToken('token_gmail'); }
    // Remove the matching linked mailboxes from the multi-account list too.
    const type = provider === 'gmail' ? 'google' : provider === 'icloud' ? 'icloud' : 'outlook';
    const next = (mailAccountsRef.current || []).filter((a) => (a.type || 'outlook') !== type);
    mailAccountsRef.current = next;
    setMailAccounts(next);
    persistAccounts(next);
    setRaw((prev) => prev.filter((e) => e.account !== provider));
    setAccounts((a) => ({ ...a, [provider]: false }));
  }, [persistAccounts]);

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
    trashEmail,
    bulkAction,
    markDone,
    markRead,
    markUnread,
    reportJunk,
    snooze,
    snoozeUntil,
    undoLast,
    dismissRecent,
    toggleVip,
    setPrefs,
    loadAccount,
    connectOutlook,
    connectGoogle,
    connectIcloud,
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
    summarizeBatch,
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
    updateMailAccount,
    bootstrapped,
    archivingSoon,
    archivingSoonCount,
    keepFromArchive,
    archiveStagedNow,
    learnOpen,
    openLearn,
    closeLearn,
    addKnownImportant,
    classifySenders,
    mailFolders,
    foldersLoading,
    loadMailFolders,
    folderMeta,
    openFolder,
    openWellKnownFolder,
    currentFolder,
    folderEmails,
    sentRanked,
    draftRanked,
    findEmail,
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
