// MailboxDrawerScreen.js — the Outlook-style mailbox drawer. Switch between
// linked accounts (or a unified "All Inboxes"), add another mailbox, and jump to
// any folder (Inbox / Sent / Drafts / Junk / Archive / custom) with live unread
// counts pulled from Microsoft Graph.

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';

// An icon per folder kind (falls back to a plain folder).
const KIND_ICON = {
  inbox: 'mail', sent: 'send', drafts: 'create', deleted: 'trash',
  archive: 'archive', junk: 'alert-circle', outbox: 'paper-plane',
};
function folderIcon(f) {
  if (f.kind && KIND_ICON[f.kind]) return KIND_ICON[f.kind];
  const n = String(f.name || '').toLowerCase();
  if (n.includes('snooz')) return 'time';
  if (n.includes('invoice') || n.includes('receipt')) return 'receipt';
  if (n.includes('lead')) return 'people';
  return 'folder';
}

function initials(s = '') {
  const p = String(s).trim().split(/[\s@.]+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

export default function MailboxDrawerScreen({ goBack, navigate }) {
  const {
    mailAccounts, activeAccountId, accountStats, switchMailAccount,
    mailFolders, foldersLoading, loadMailFolders, folderMeta, openFolder,
  } = useStore();

  useEffect(() => { loadMailFolders(); }, [activeAccountId]); // eslint-disable-line

  const accounts = mailAccounts || [];
  const headerName = folderMeta?.displayName || folderMeta?.email
    || (activeAccountId === 'all' ? 'All Inboxes' : accounts.find((a) => a.id === activeAccountId)?.email)
    || 'Microsoft 365';
  const headerSub = activeAccountId === 'all'
    ? `${accounts.length} mailbox${accounts.length === 1 ? '' : 'es'}`
    : (folderMeta?.email || accounts.find((a) => a.id === activeAccountId)?.email || '');

  const pickAccount = (id) => { switchMailAccount(id); goBack(); };
  const goInbox = () => { openFolder(null); goBack(); };
  const goFolder = (f) => {
    if (f.kind === 'inbox') { goInbox(); return; }
    openFolder(f);
    navigate('Folder');
  };

  // Flatten one level of children under their parent for the list.
  const flat = [];
  (mailFolders || []).forEach((f) => {
    flat.push({ ...f, depth: 0 });
    (f.children || []).forEach((c) => flat.push({ ...c, depth: 1 }));
  });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header: who you're viewing + close */}
      <View style={styles.header}>
        <View style={styles.headAvatar}><Text style={styles.headAvatarText}>{initials(headerName)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headName} numberOfLines={1}>{headerName}</Text>
          {!!headerSub && <Text style={styles.headSub} numberOfLines={1}>{headerSub}</Text>}
        </View>
        <Pressable onPress={goBack} hitSlop={10}><Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" /></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Account switcher */}
        <Text style={styles.sectionLabel}>Accounts</Text>
        <View style={styles.accountRail}>
          {accounts.length > 1 && (
            <AccountChip
              label="All" sub="Inboxes" active={activeAccountId === 'all'}
              onPress={() => pickAccount('all')}
              badge={Object.values(accountStats || {}).reduce((n, s) => n + (s?.unread || 0), 0)}
              icon="albums"
            />
          )}
          {accounts.map((a) => (
            <AccountChip
              key={a.id}
              label={initials(a.email || 'Outlook')}
              sub={a.email ? a.email.split('@')[0] : 'Outlook'}
              active={activeAccountId === a.id}
              badge={accountStats?.[a.id]?.unread || 0}
              onPress={() => pickAccount(a.id)}
            />
          ))}
          <Pressable style={styles.addChip} onPress={() => navigate('Connect')}>
            <Ionicons name="add" size={22} color={colors.blue} />
            <Text style={styles.addChipText}>Add</Text>
          </Pressable>
        </View>

        {/* Quick links */}
        <Pressable style={styles.calRow} onPress={() => navigate('Calendar')}>
          <Ionicons name="calendar" size={19} color={colors.blue} style={styles.folderIcon} />
          <Text style={styles.folderName}>Calendar</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.35)" />
        </Pressable>

        {/* Folders */}
        <Text style={styles.sectionLabel}>Folders</Text>
        {foldersLoading && !flat.length ? (
          <ActivityIndicator color={colors.blue} style={{ marginTop: 20 }} />
        ) : !flat.length ? (
          <Text style={styles.empty}>No folders to show. Pull the inbox to sync, or add an account.</Text>
        ) : (
          <View style={styles.folderList}>
            {flat.map((f) => (
              <Pressable key={f.id} style={[styles.folderRow, f.depth ? styles.folderChild : null]} onPress={() => goFolder(f)}>
                <Ionicons name={folderIcon(f)} size={19} color="rgba(255,255,255,0.75)" style={styles.folderIcon} />
                <Text style={styles.folderName} numberOfLines={1}>{f.name}</Text>
                {f.unread > 0 && (
                  <View style={[styles.countPill, f.kind === 'inbox' && styles.countPillInbox]}>
                    <Text style={styles.countPillText}>{f.unread > 999 ? '999+' : f.unread}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}

        <Pressable style={styles.manageRow} onPress={() => navigate('Connect')}>
          <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.6)" />
          <Text style={styles.manageText}>Manage accounts</Text>
        </Pressable>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountChip({ label, sub, active, onPress, badge, icon }) {
  return (
    <Pressable style={styles.acctChip} onPress={onPress}>
      <View style={[styles.acctAvatar, active && styles.acctAvatarActive]}>
        {icon ? <Ionicons name={icon} size={20} color="#fff" /> : <Text style={styles.acctAvatarText}>{label}</Text>}
        {badge > 0 && <View style={styles.acctBadge}><Text style={styles.acctBadgeText}>{badge > 99 ? '99+' : badge}</Text></View>}
      </View>
      <Text style={[styles.acctSub, active && styles.acctSubActive]} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  headAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  headAvatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  headName: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, marginTop: 1 },
  body: { padding: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginTop: 14, marginBottom: 12 },
  accountRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  acctChip: { alignItems: 'center', width: 60 },
  acctAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  acctAvatarActive: { borderWidth: 2.5, borderColor: colors.blue, backgroundColor: 'rgba(0,113,227,0.25)' },
  acctAvatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  acctSub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 5, maxWidth: 60, textAlign: 'center' },
  acctSubActive: { color: '#fff', fontWeight: '600' },
  acctBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  acctBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  addChip: { alignItems: 'center', justifyContent: 'center', width: 60 },
  addChipText: { color: colors.blue, fontSize: 11, marginTop: 5, fontWeight: '600' },
  calRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, marginTop: 4 },
  folderList: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, overflow: 'hidden' },
  folderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  folderChild: { paddingLeft: 34, backgroundColor: 'rgba(255,255,255,0.03)' },
  folderIcon: { width: 26 },
  folderName: { flex: 1, color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '500' },
  countPill: { minWidth: 24, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  countPillInbox: { backgroundColor: colors.blue },
  countPillText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  empty: { color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 19 },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingHorizontal: 4 },
  manageText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '500' },
});
