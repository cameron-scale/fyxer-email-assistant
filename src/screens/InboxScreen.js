// InboxScreen.js — the ScaleMail home screen. Navy background, logo lockup,
// search pill, scrollable filter chips, and day-grouped white cards driven by
// Brisk's priority engine. Doubles as the Starred tab via the `starred` prop.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SectionList, Pressable, RefreshControl, TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, space, font, radius, gradients } from '../theme';
import { useStore, SORTS } from '../store';
import EmailCard from '../components/EmailCard';
import SwipeableRow from '../components/SwipeableRow';
import ProfileAvatar from '../components/ProfileAvatar';
import LearnInboxCard from '../components/LearnInboxCard';
import { dayBucket, longToday } from '../lib/time';
import { useTourTarget } from '../lib/tour';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'starred', label: 'Starred' },
  { key: 'Action Needed', label: 'Action Needed' },
  { key: 'Meeting', label: 'Meeting' },
  { key: 'Client', label: 'Client' },
  { key: 'Newsletter', label: 'Newsletter' },
  { key: 'FYI', label: 'FYI' },
];
const CATEGORY_FILTERS = ['Action Needed', 'Meeting', 'Client', 'Newsletter', 'FYI'];

const SECTION_ORDER = ['Today', 'Yesterday', 'Earlier'];

export default function InboxScreen({ navigate, starred, openSheet, params }) {
  const {
    emails, counts, loading, refresh, snooze, archive, accounts, error, sortBy, setSortBy,
    searchEmails, searching: searchBusy, runSearch, clearSearch, chatAnswer, askMailQuestion,
    mailboxUnread, syncingAll, prefs,
  } = useStore();
  const connected = accounts.outlook || accounts.gmail;
  const [filter, setFilter] = useState(params?.filter || 'all');
  // A smart-folder tab opens the inbox pre-filtered; the plain Inbox tab clears it.
  useEffect(() => { setFilter(params?.filter || 'all'); }, [params?.filter]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [aiMode, setAiMode] = useState(false); // search bar becomes an AI chat

  // Multi-select for bulk actions (archive / delete / mark read).
  const { trashEmail, bulkAction, summarizeBatch } = useStore();

  // Lazy summaries: show 50 per box; reveal + summarize 50 more when you scroll past.
  const PAGE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => { setVisibleCount(PAGE); }, [filter, starred]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const toggleSelect = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const enterSelect = (id) => { setSelectMode(true); setSelected(new Set([id])); };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  // Onboarding-tour spotlight targets.
  const wordmarkRef = useTourTarget('inbox.wordmark');
  const avatarRef = useTourTarget('inbox.avatar');
  const searchRowRef = useTourTarget('inbox.searchRow');
  const chipsRef = useTourTarget('inbox.chips');
  const firstCardRef = useTourTarget('inbox.firstCard');
  const firstTagRef = useTourTarget('inbox.firstTag');

  const q = query.trim().toLowerCase();
  // Whole-mailbox search runs server-side (debounced); Starred tab stays local.
  // In AI mode we don't auto-run — the user submits a question.
  const usingSearch = !starred && query.trim().length > 0;
  useEffect(() => {
    if (starred || aiMode) return undefined;
    const t = setTimeout(() => {
      if (query.trim()) runSearch(query.trim());
      else clearSearch();
    }, 450);
    return () => clearTimeout(t);
  }, [query, starred, aiMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = starred
    ? emails.filter((e) => e.priority.isVip)
    : usingSearch ? (searchEmails || []) : emails;

  const shown = base.filter((e) => {
    if (!starred && !usingSearch) {
      if (filter === 'unread' && e.read !== false) return false;
      if (filter === 'urgent' && e.priority.bucket !== 'urgent') return false;
      if (filter === 'starred' && !e.priority.isVip) return false;
      if (CATEGORY_FILTERS.includes(filter) && e.priority.category !== filter) return false;
    }
    return true; // server already matched the query text when searching
  });

  // Collapse same-conversation emails into one card. The card REPRESENTS the
  // highest-priority message in the thread (so an urgent email is never hidden
  // under a newer, less-important reply), shown at the thread's newest position.
  // Off in search/starred views where grouping would hide matches.
  const threaded = (prefs?.groupThreads && !usingSearch && !starred)
    ? (() => {
      const groups = new Map(); // threadKey -> [emails]
      const seenIds = new Set(); // de-dupe so a thread can't over-count the same message
      shown.forEach((e) => {
        if (e.threadKey && !seenIds.has(e.id)) {
          seenIds.add(e.id);
          if (!groups.has(e.threadKey)) groups.set(e.threadKey, []);
          groups.get(e.threadKey).push(e);
        }
      });
      const emitted = new Set();
      const out = [];
      for (const e of shown) {
        const key = e.threadKey;
        if (!key) { out.push(e); continue; }
        if (emitted.has(key)) continue;
        emitted.add(key);
        const group = groups.get(key);
        if (group.length === 1) { out.push(group[0]); continue; }
        // Only collapse a REAL conversation: a reply/forward, or more than one
        // distinct sender. Bulk senders (marketing blasts) often share one Outlook
        // conversationId, which isn't a thread — show those as separate rows.
        const senders = new Set(group.map((g) => (g.priority?.senderEmail || '').toLowerCase()));
        const hasReply = group.some((g) => /^\s*(re|fwd|fw)\s*:/i.test(g.subject || ''));
        if (!hasReply && senders.size <= 1) { group.forEach((g) => out.push(g)); continue; }
        const rep = group.reduce((best, x) => ((x.priority?.score ?? 0) > (best.priority?.score ?? 0) ? x : best), group[0]);
        out.push({ ...rep, threadCount: group.length });
      }
      return out;
    })()
    : shown;

  // Only render (and summarize) the first `visibleCount` of this box; the rest
  // load when you scroll to the bottom.
  const visible = threaded.slice(0, visibleCount);
  const hasMore = threaded.length > visibleCount;
  // Summarize just the emails currently in view for this box (50 at a time).
  useEffect(() => {
    if (visible.length) summarizeBatch(visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount, filter, starred, threaded.length]);

  // Select-all over the currently-visible list.
  const allVisibleIds = visible.map((e) => e.id);
  const allSelected = selectMode && allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const selectAll = () => setSelected(allSelected ? new Set() : new Set(allVisibleIds));
  const applyBulk = (action) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === 'trash') bulkAction(ids, 'trash');
    else if (action === 'archive') bulkAction(ids, 'archive');
    else if (action === 'read') bulkAction(ids, 'read');
    exitSelect();
  };

  // Group into Today / Yesterday / Earlier sections (only the visible slice).
  const grouped = {};
  visible.forEach((e) => {
    const key = dayBucket(e.date);
    (grouped[key] = grouped[key] || []).push(e);
  });
  const sections = SECTION_ORDER
    .filter((k) => grouped[k]?.length)
    .map((k) => ({ title: k === 'Today' ? `Today — ${longToday()}` : k, data: grouped[k] }));

  // The wordmark badge shows the mailbox's true unread count (matches Outlook);
  // the per-filter "Unread" chip uses the same number once known.
  const loadedUnread = emails.filter((e) => e.read === false).length;
  const unreadCount = mailboxUnread != null ? mailboxUnread : loadedUnread;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Scrim — darkens the aurora just enough to keep the email rows readable,
          while sitting behind all interactive content (above the aurora layer). */}
      <View style={styles.scrim} pointerEvents="none" />

      {/* Navy header glow */}
      <LinearGradient colors={gradients.header} style={styles.glow} pointerEvents="none" />

      <SectionList
        sections={sections}
        keyExtractor={(e) => `${e.account}-${e.id}`}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (hasMore) setVisibleCount((c) => c + PAGE); }}
        ListFooterComponent={hasMore ? (
          <View style={styles.loadMore}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadMoreText}>Loading & summarizing more…</Text>
          </View>
        ) : null}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#fff" />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <View style={styles.leftGroup}>
                {!starred && (
                  <Pressable style={styles.menuBtn} hitSlop={8} onPress={() => navigate('MailboxDrawer')}>
                    <Ionicons name="menu" size={24} color="#fff" />
                  </Pressable>
                )}
                <View>
                <Text style={styles.eyebrow}>{starred ? 'Mailbox' : (syncingAll ? 'Syncing all mail…' : "Cameron's Inbox")}</Text>
                <View ref={wordmarkRef} collapsable={false} style={styles.logoRow}>
                  <Text style={styles.logoScale}>Scale</Text>
                  <Text style={styles.logoMail}>Mail</Text>
                  {starred ? (
                    <Text style={styles.logoSuffix}>  Starred</Text>
                  ) : unreadCount > 0 ? (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
                </View>
              </View>
              <View ref={avatarRef} collapsable={false}>
                <Pressable style={styles.avatar} onPress={() => openSheet && openSheet('profile')}>
                  <ProfileAvatar size={40} />
                </Pressable>
              </View>
            </View>

            {/* Search */}
            {searching ? (
              <View style={[styles.searchActive, aiMode && styles.searchActiveAi]}>
                <Ionicons name={aiMode ? 'sparkles' : 'search'} size={16} color={aiMode ? colors.blue : colors.onDarkFaint} />
                <TextInput
                  style={styles.searchActiveInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={aiMode ? 'Ask about your mail…' : 'Search mail…'}
                  placeholderTextColor={colors.onDarkFaint}
                  autoFocus
                  returnKeyType={aiMode ? 'send' : 'search'}
                  onSubmitEditing={() => { if (aiMode && query.trim()) askMailQuestion(query.trim()); }}
                />
                <Pressable hitSlop={8} onPress={() => setAiMode((v) => !v)} style={styles.aiToggle}>
                  <Ionicons name={aiMode ? 'sparkles' : 'sparkles-outline'} size={18} color={aiMode ? colors.blue : colors.onDarkFaint} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => { setSearching(false); setQuery(''); setAiMode(false); clearSearch(); }}>
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <View ref={searchRowRef} collapsable={false} style={styles.searchRow}>
                <Pressable style={styles.searchPill} onPress={() => setSearching(true)}>
                  <Ionicons name="search" size={15} color={colors.onDarkFaint} />
                  <Text style={styles.searchText}>Search mail…</Text>
                </Pressable>
                <Pressable style={[styles.sortBtn, styles.aiPillBtn]} onPress={() => { setSearching(true); setAiMode(true); }}>
                  <Ionicons name="sparkles" size={17} color={colors.blue} />
                </Pressable>
                <Pressable style={styles.sortBtn} onPress={() => setSortOpen((v) => !v)}>
                  <Ionicons name="swap-vertical" size={18} color="#fff" />
                </Pressable>
              </View>
            )}

            {/* AI answer banner */}
            {aiMode && !!chatAnswer && (
              <View style={styles.aiAnswer}>
                <Ionicons name="sparkles" size={14} color={colors.blue} />
                <Text style={styles.aiAnswerText}>{chatAnswer}</Text>
              </View>
            )}

            {/* Sort menu */}
            {sortOpen && !searching && (
              <View style={styles.sortMenu}>
                {Object.entries(SORTS).map(([key, label]) => {
                  const active = sortBy === key;
                  return (
                    <Pressable key={key} style={styles.sortItem}
                      onPress={() => { setSortBy(key); setSortOpen(false); }}>
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={16} color={active ? colors.blue : colors.onDarkFaint}
                      />
                      <Text style={[styles.sortItemText, active && { color: '#fff', fontWeight: '700' }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Filter chips */}
            {!starred && !searching && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsWrap}
                contentContainerStyle={styles.chipsRow}
                ref={chipsRef}
                collapsable={false}
              >
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  let count = 0;
                  if (f.key === 'unread') count = unreadCount;
                  else if (counts[f.key] !== undefined) count = counts[f.key];
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setFilter(f.key)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                      {f.key !== 'all' && count > 0 && (
                        <View style={styles.chipBadge}>
                          <Text style={styles.chipBadgeText}>{count > 99 ? '99+' : count}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {!!error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color="#fff" />
                <Text style={styles.errorText} numberOfLines={3}>{error}</Text>
              </View>
            )}

            {/* One-time "learn my inbox" after sign-in */}
            {!starred && !usingSearch && connected && prefs?.learnedInbox === false && emails.length > 0 && (
              <LearnInboxCard />
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionEyebrow}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const isFirst = item.id === shown[0]?.id;
          const card = (
            <EmailCard
              email={item} tagRef={isFirst ? firstTagRef : undefined}
              selectMode={selectMode} selected={selected.has(item.id)}
              onPress={selectMode ? () => toggleSelect(item.id) : () => navigate('Thread', { id: item.id })}
              onLongPress={() => enterSelect(item.id)}
            />
          );
          return (
            <View ref={isFirst ? firstCardRef : undefined} collapsable={false} style={styles.cardWrap}>
              {selectMode ? card : (
                <SwipeableRow onSwipeRight={() => snooze(item.id)} onSwipeLeft={() => archive(item.id)}>
                  {card}
                </SwipeableRow>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          usingSearch ? (
            <View style={styles.empty}>
              {searchBusy ? (
                <>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.emptySub}>Searching all your mail…</Text>
                </>
              ) : (
                <>
                  <View style={styles.emptyIcon}><Ionicons name="search" size={28} color={colors.onDarkFaint} /></View>
                  <Text style={styles.emptyTitle}>No matches</Text>
                  <Text style={styles.emptySub}>Nothing found for “{query.trim()}”.</Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={starred ? 'star-outline' : connected ? 'checkmark-done' : 'mail-outline'}
                  size={28} color={colors.onDarkFaint}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {starred ? 'No starred mail' : connected ? 'Inbox zero' : 'No inbox yet'}
              </Text>
              <Text style={styles.emptySub}>
                {starred ? 'Star a sender to keep them here.'
                  : connected ? 'Nothing left to triage. Nice work.'
                  : 'Tap the profile icon to connect your email.'}
              </Text>
              {!starred && !connected && (
                <Pressable style={styles.connectBtn} onPress={() => navigate('Connect')}>
                  <Text style={styles.connectBtnText}>Connect email</Text>
                </Pressable>
              )}
            </View>
          )
        }
      />

      {/* Multi-select: top bar (count + select all + cancel) and bottom actions */}
      {selectMode && (
        <>
          <SafeAreaView style={styles.selTopWrap} pointerEvents="box-none">
            <View style={styles.selTop}>
              <Pressable hitSlop={10} onPress={exitSelect}><Text style={styles.selCancel}>Cancel</Text></Pressable>
              <Text style={styles.selCount}>{selected.size} selected</Text>
              <Pressable hitSlop={10} onPress={selectAll}><Text style={styles.selAll}>{allSelected ? 'Deselect all' : 'Select all'}</Text></Pressable>
            </View>
          </SafeAreaView>
          <View style={styles.selBar}>
            <SelAction icon="mail-open-outline" label="Read" onPress={() => applyBulk('read')} disabled={!selected.size} />
            <SelAction icon="archive-outline" label="Archive" onPress={() => applyBulk('archive')} disabled={!selected.size} />
            <SelAction icon="trash-outline" label="Delete" color="#FF453A" onPress={() => applyBulk('trash')} disabled={!selected.size} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function SelAction({ icon, label, onPress, disabled, color }) {
  return (
    <Pressable style={[styles.selActionBtn, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={22} color={color || '#fff'} />
      <Text style={[styles.selActionLabel, color && { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' }, // aurora shows through
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,12,20,0.52)' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 230 },
  loadMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 22 },
  loadMoreText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  selTopWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  selTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(10,12,24,0.96)', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  selCancel: { color: colors.blue, fontSize: 16, fontWeight: '600' },
  selCount: { color: '#fff', fontSize: 16, fontWeight: '800' },
  selAll: { color: colors.blue, fontSize: 15, fontWeight: '600' },
  selBar: { position: 'absolute', bottom: 96, left: 16, right: 16, zIndex: 30, flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(20,22,34,0.98)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingVertical: 12, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  selActionBtn: { alignItems: 'center', gap: 4, paddingHorizontal: 18 },
  selActionLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
  list: { paddingHorizontal: 0, paddingBottom: 100 },
  header: { paddingHorizontal: 16, paddingTop: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  leftGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: {
    fontSize: 12, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)', marginBottom: 6,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoScale: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -1.3 },
  logoMail: { fontSize: 32, fontWeight: '800', color: colors.blue, letterSpacing: -1.3 },
  logoCount: { fontSize: 32, fontWeight: '800', color: colors.blue, letterSpacing: -1.3, opacity: 0.7 },
  countBadge: {
    backgroundColor: colors.blue, borderRadius: 11, minWidth: 22, height: 22,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
    marginLeft: 8, marginTop: 4, alignSelf: 'flex-start',
  },
  countBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  logoSuffix: { fontSize: 26, fontWeight: '800', color: colors.blue, letterSpacing: -1, opacity: 0.55 },
  avatar: { marginTop: 4 },
  avatarFill: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  searchPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: colors.onDarkFill, borderWidth: 1, borderColor: colors.onDarkBorder,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15,
  },
  searchText: { fontSize: 14, color: 'rgba(255,255,255,0.3)' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  sortBtn: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.onDarkFill, borderWidth: 1, borderColor: colors.onDarkBorder,
  },
  sortMenu: {
    backgroundColor: '#1A2140', borderRadius: 14, borderWidth: 1, borderColor: colors.onDarkBorder,
    paddingVertical: 4, marginBottom: 14,
  },
  sortItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  sortItemText: { color: 'rgba(255,255,255,0.65)', fontSize: 14 },
  searchActive: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, paddingHorizontal: 12, marginBottom: 14,
  },
  searchActiveInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 11 },
  searchActiveAi: { backgroundColor: 'rgba(0,113,227,0.18)', borderColor: 'rgba(0,113,227,0.5)' },
  aiToggle: { paddingHorizontal: 4 },
  aiPillBtn: { backgroundColor: 'rgba(0,113,227,0.16)', borderColor: 'rgba(0,113,227,0.4)' },
  aiAnswer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14,
    backgroundColor: 'rgba(0,113,227,0.14)', borderWidth: 1, borderColor: 'rgba(0,113,227,0.3)',
    borderRadius: radius.md, padding: 12,
  },
  aiAnswerText: { color: '#fff', fontSize: 13.5, flex: 1, lineHeight: 19 },
  cancel: { color: colors.blue, fontSize: 15, fontWeight: '500' },
  chipsWrap: { marginBottom: 12, marginHorizontal: -6 },
  chipsRow: { gap: 7, paddingHorizontal: 6, paddingRight: 24, paddingTop: 8 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  chipTextActive: { color: '#fff' },
  chipBadge: {
    position: 'absolute', top: -7, right: -5, minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.bg,
  },
  chipBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  sectionEyebrow: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)', paddingLeft: 26, paddingTop: 14, paddingBottom: 8,
  },
  cardWrap: { marginBottom: 0 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.onDarkFill,
    borderWidth: 1, borderColor: colors.onDarkBorder, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.32)', textAlign: 'center' },
  connectBtn: { marginTop: 16, backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 24 },
  connectBtnText: { color: '#fff', fontWeight: '800', fontSize: font.body },
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(255,92,122,0.18)', borderWidth: 1, borderColor: 'rgba(255,92,122,0.4)',
    borderRadius: radius.md, padding: 12, marginBottom: 10,
  },
  errorText: { color: '#fff', fontSize: 13, flex: 1, lineHeight: 18 },
});
