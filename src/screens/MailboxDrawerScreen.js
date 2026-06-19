// MailboxDrawerScreen.js — the mailbox drawer, rebuilt as a full-screen glass
// overlay. Up top: an active-account card (rename via long-press) and a compact
// account switcher rail. Below: an Integrations row (Calendar with live event
// counts), then three grouped folder lists (Primary / System / Labels) mapped
// from the real Microsoft Graph / Gmail folders, with live unread counts.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';
import { useStore } from '../store';
import { upcomingEvents } from '../lib/backend';

function initials(s = '') {
  const p = String(s).trim().split(/[\s@.]+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

// Render a count, clamping large values. Avatar badges use a tighter cap.
function fmtCount(n, big = false) {
  if (!n) return '0';
  if (n > 999) return '999+';
  if (big && n > 99) return '99+';
  return String(n);
}

const norm = (s) => String(s || '').toLowerCase();

// Flatten the (possibly nested) folder tree into a flat list once.
function flatten(folders) {
  const out = [];
  (folders || []).forEach((f) => {
    out.push(f);
    (f.children || []).forEach((c) => out.push(c));
  });
  return out;
}

export default function MailboxDrawerScreen({ goBack, navigate }) {
  const {
    mailAccounts, activeAccountId, accountStats, switchMailAccount, updateMailAccount,
    mailFolders, foldersLoading, loadMailFolders, folderMeta, openFolder,
    prefs, outlookRefresh,
  } = useStore();

  useEffect(() => { loadMailFolders(); }, [activeAccountId]); // eslint-disable-line

  // Best-effort calendar counts (today / this week) — loaded once.
  const [calCounts, setCalCounts] = useState({ today: 0, week: 0 });
  useEffect(() => {
    if (!outlookRefresh) { setCalCounts({ today: 0, week: 0 }); return; }
    let alive = true;
    upcomingEvents(prefs?.serverUrl, outlookRefresh, 14)
      .then((r) => {
        if (!alive) return;
        const now = new Date();
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endToday = new Date(startToday.getTime() + 24 * 60 * 60 * 1000);
        const endWeek = new Date(startToday.getTime() + 7 * 24 * 60 * 60 * 1000);
        let today = 0; let week = 0;
        (r?.events || []).forEach((e) => {
          if (!e?.start) return;
          const s = new Date(e.start);
          if (s >= startToday && s < endWeek) week += 1;
          if (s >= startToday && s < endToday) today += 1;
        });
        setCalCounts({ today, week });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [prefs?.serverUrl, outlookRefresh]);

  const accounts = mailAccounts || [];
  const isAll = activeAccountId === 'all';
  const activeAccount = accounts.find((a) => a.id === activeAccountId) || null;

  // Unread for a given account id, or the unified sum for 'all'.
  const sumUnread = Object.values(accountStats || {}).reduce((n, s) => n + (s?.unread || 0), 0);
  const activeUnread = isAll ? sumUnread : (accountStats?.[activeAccountId]?.unread || 0);

  const activeName = isAll
    ? 'All Inboxes'
    : (activeAccount?.name || folderMeta?.displayName || activeAccount?.email || 'Mailbox');
  const activeEmail = isAll
    ? `${accounts.length} mailbox${accounts.length === 1 ? '' : 'es'}`
    : (folderMeta?.email || activeAccount?.email || '');

  const pickAccount = (id) => { switchMailAccount(id); goBack(); };
  const goInbox = () => { openFolder(null); goBack(); };
  const goFolder = (f) => {
    if (!f) return;
    if (f.kind === 'inbox') { goInbox(); return; }
    openFolder(f);
    navigate('Folder');
  };

  const renameActive = () => {
    if (isAll || !activeAccountId) return;
    if (typeof Alert.prompt !== 'function') return;
    Alert.prompt(
      'Rename mailbox',
      'Give this account a custom label.',
      (name) => {
        const trimmed = String(name || '').trim();
        if (trimmed) updateMailAccount(activeAccountId, { name: trimmed });
      },
      'plain-text',
      activeAccount?.name || '',
    );
  };

  // ── Map the real folders into the three display groups ──
  const flat = flatten(mailFolders);
  const used = new Set();
  const take = (pred) => {
    const f = flat.find((x) => !used.has(x.id) && pred(x));
    if (f) used.add(f.id);
    return f || null;
  };
  const byKind = (k) => (f) => f.kind === k;
  const byName = (sub) => (f) => norm(f.name).includes(sub);

  // Primary
  const fInbox = take(byKind('inbox'));
  const fStarred = take(byName('star'));
  const fSent = take((f) => f.kind === 'sent' || byName('sent')(f));
  const fDrafts = take((f) => f.kind === 'drafts' || byName('draft')(f));

  // System
  const fImportant = take(byName('important'));
  const fSpam = take((f) => f.kind === 'junk' || byName('spam')(f) || byName('junk')(f));
  const fTrash = take((f) => f.kind === 'deleted' || byName('trash')(f) || byName('deleted')(f));

  // Labels = everything left over (custom folders / personal labels).
  const labelFolders = flat.filter((f) => !used.has(f.id));

  const hasAnyFolder = flat.length > 0;
  const loadingFolders = foldersLoading && !hasAnyFolder;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Full-bleed scrim so the aurora reads as a darkened backdrop. */}
      <View style={styles.scrim} pointerEvents="none" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Label row + close */}
        <View style={styles.labelRow}>
          <Text style={styles.cardLabel}>Active Account</Text>
          <Pressable onPress={goBack} hitSlop={10}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>

        {/* Active account card */}
        <Pressable
          style={styles.activeCard}
          onLongPress={renameActive}
          delayLongPress={350}
        >
          <View style={styles.avatarWrap}>
            <LinearGradient colors={['#3B82F6', '#1D4ED8']} style={styles.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={styles.avatarText}>{initials(activeName === 'All Inboxes' ? 'All' : (activeAccount?.email || activeName))}</Text>
            </LinearGradient>
          </View>
          <View style={styles.activeMeta}>
            <Text style={styles.activeName} numberOfLines={1}>{activeName}</Text>
            {!!activeEmail && <Text style={styles.activeEmail} numberOfLines={1}>{activeEmail}</Text>}
          </View>
          {activeUnread > 0 && (
            <View style={styles.redBadge}>
              <Text style={styles.redBadgeText}>{fmtCount(activeUnread)}</Text>
            </View>
          )}
        </Pressable>

        {/* Account switcher rail */}
        <View style={styles.rail}>
          <Avatar
            label="All"
            initialsText="∞"
            active={isAll}
            badge={sumUnread}
            onPress={() => pickAccount('all')}
            isAll
          />
          {accounts.map((a) => (
            <Avatar
              key={a.id}
              label={a.name || (a.email ? a.email.split('@')[0] : (a.type === 'google' ? 'Gmail' : 'Outlook'))}
              initialsText={initials(a.email || a.name || a.type)}
              active={!isAll && a.id === activeAccountId}
              badge={accountStats?.[a.id]?.unread || 0}
              accent={a.color}
              onPress={() => pickAccount(a.id)}
            />
          ))}
          <Pressable style={styles.addCol} onPress={() => navigate('Connect')}>
            <View style={styles.addCircle}>
              <Ionicons name="add" size={20} color="rgba(255,255,255,0.75)" />
            </View>
            <Text style={styles.avatarLabel} numberOfLines={1}>Add</Text>
          </Pressable>
        </View>

        {/* Integrations */}
        <Text style={styles.sectionLabel}>Integrations</Text>
        <Pressable style={styles.calRow} onPress={() => navigate('Calendar')}>
          <View style={styles.calIcon}>
            <Ionicons name="calendar" size={18} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.calTitle}>Calendar</Text>
            <Text style={styles.calSub} numberOfLines={1}>
              {calCounts.today} today · {calCounts.week} this week
            </Text>
          </View>
          {calCounts.today > 0 && (
            <View style={styles.bluePill}>
              <Text style={styles.bluePillText}>{fmtCount(calCounts.today)}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.35)" style={{ marginLeft: 8 }} />
        </Pressable>

        {/* Folder groups */}
        {loadingFolders ? (
          <ActivityIndicator color={colors.blue} style={{ marginTop: 28 }} />
        ) : !hasAnyFolder ? (
          <Text style={styles.empty}>No folders to show. Pull the inbox to sync, or add an account.</Text>
        ) : (
          <>
            <FolderGroup
              title="Primary"
              rows={[
                fInbox && { f: fInbox, label: 'Inbox', icon: 'mail', iconColor: '#60A5FA', badge: fInbox.unread, badgeKind: 'blue' },
                fStarred && { f: fStarred, label: 'Starred', icon: 'star', iconColor: colors.star, badge: fStarred.unread, badgeKind: 'muted' },
                fSent && { f: fSent, label: 'Sent', icon: 'send', iconColor: '#34D399', badge: fSent.unread, badgeKind: 'muted' },
                fDrafts && { f: fDrafts, label: 'Drafts', icon: 'create', iconColor: '#A78BFA', badge: 0, badgeKind: 'none' },
              ].filter(Boolean)}
              textColor="rgba(255,255,255,0.92)"
              onPress={goFolder}
            />
            <FolderGroup
              title="System"
              rows={[
                fImportant && { f: fImportant, label: fImportant.name, icon: 'flag', iconColor: '#FBBF24', badge: fImportant.unread, badgeKind: 'muted' },
                fSpam && { f: fSpam, label: fSpam.name, icon: 'alert-circle', iconColor: '#FF8A80', badge: fSpam.unread, badgeKind: 'red' },
                fTrash && { f: fTrash, label: fTrash.name, icon: 'trash', iconColor: '#9CA3AF', badge: fTrash.unread, badgeKind: 'muted' },
              ].filter(Boolean)}
              textColor="rgba(255,255,255,0.52)"
              onPress={goFolder}
            />
            {labelFolders.length > 0 && (
              <FolderGroup
                title="Labels"
                rows={labelFolders.map((f) => ({
                  f, label: f.name, icon: 'pricetag', iconColor: f.color || 'rgba(255,255,255,0.4)', badge: 0, badgeKind: 'none',
                }))}
                textColor="rgba(255,255,255,0.4)"
                onPress={goFolder}
              />
            )}
          </>
        )}

        {/* Manage accounts */}
        <Pressable style={styles.manageRow} onPress={() => navigate('Connect')}>
          <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.6)" />
          <Text style={styles.manageText}>Manage accounts</Text>
        </Pressable>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// A switcher-rail avatar with a tiny unread badge + label underneath.
function Avatar({ label, initialsText, active, badge, onPress, accent, isAll }) {
  return (
    <Pressable style={styles.avatarCol} onPress={onPress}>
      <View style={[styles.railAvatar, active && styles.railAvatarActive, accent && active && { borderColor: accent }]}>
        {isAll ? (
          <Ionicons name="albums" size={18} color="#fff" />
        ) : (
          <Text style={styles.railAvatarText}>{initialsText}</Text>
        )}
        {badge > 0 && (
          <View style={styles.smallBadge}>
            <Text style={styles.smallBadgeText}>{fmtCount(badge, true)}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.avatarLabel, active && styles.avatarLabelActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// A grouped, hairline-divided glass tile of folder rows.
function FolderGroup({ title, rows, textColor, onPress }) {
  if (!rows.length) return null;
  return (
    <>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.groupTile}>
        {rows.map((r, i) => (
          <Pressable
            key={r.f.id}
            style={[styles.folderRow, i === rows.length - 1 && styles.folderRowLast]}
            onPress={() => onPress(r.f)}
          >
            <View style={styles.folderIconBox}>
              <Ionicons name={r.icon} size={16} color={r.iconColor} />
            </View>
            <Text style={[styles.folderName, { color: textColor }]} numberOfLines={1}>{r.label}</Text>
            {r.badgeKind !== 'none' && r.badge > 0 && (
              <View style={[
                styles.badge,
                r.badgeKind === 'blue' && styles.badgeBlue,
                r.badgeKind === 'red' && styles.badgeRed,
                r.badgeKind === 'muted' && styles.badgeMuted,
              ]}>
                <Text style={[styles.badgeText, r.badgeKind === 'red' && styles.badgeTextRed]}>{fmtCount(r.badge)}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,18,0.50)' },
  body: { padding: 18, paddingTop: 12 },

  // Active account card
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 },
  cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' },
  activeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(26,107,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(26,107,255,0.22)', borderTopColor: 'rgba(147,197,253,0.35)',
    borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16,
  },
  avatarWrap: {
    shadowColor: '#3B82F6', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
    borderRadius: 22,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(147,197,253,0.6)',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  activeMeta: { flex: 1 },
  activeName: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  activeEmail: { color: 'rgba(147,197,253,0.7)', fontSize: 12, marginTop: 2 },
  redBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  redBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Switcher rail
  rail: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 16, paddingHorizontal: 2 },
  avatarCol: { alignItems: 'center', width: 52 },
  railAvatar: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  railAvatarActive: { borderWidth: 2, borderColor: colors.blue, backgroundColor: 'rgba(26,107,255,0.22)' },
  railAvatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  smallBadge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: 'rgba(8,10,18,0.9)' },
  smallBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  avatarLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10.5, marginTop: 6, maxWidth: 52, textAlign: 'center' },
  avatarLabelActive: { color: '#fff', fontWeight: '600' },
  addCol: { alignItems: 'center', width: 52 },
  addCircle: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderStyle: 'dashed',
  },

  // Section label (shared)
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginTop: 22, marginBottom: 10, paddingHorizontal: 2 },

  // Calendar row
  calRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12 },
  calIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(26,107,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  calTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  calSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  bluePill: { minWidth: 24, height: 22, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  bluePillText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Folder groups
  groupTile: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, overflow: 'hidden' },
  folderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  folderRowLast: { borderBottomWidth: 0 },
  folderIconBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  folderName: { flex: 1, fontSize: 15, fontWeight: '500' },
  badge: { minWidth: 24, paddingHorizontal: 7, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeMuted: { backgroundColor: 'rgba(255,255,255,0.14)' },
  badgeBlue: { backgroundColor: colors.blue },
  badgeRed: { backgroundColor: 'rgba(255,59,48,0.18)' },
  badgeText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  badgeTextRed: { color: '#FF8A80' },

  empty: { color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 19, marginTop: 24 },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, paddingHorizontal: 4 },
  manageText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '500' },
});
