// InboxScreen.js — the ScaleMail home screen. Navy background, logo lockup,
// search pill, scrollable filter chips, and day-grouped white cards driven by
// Brisk's priority engine. Doubles as the Starred tab via the `starred` prop.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, Pressable, RefreshControl, TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, space, font, radius, gradients } from '../theme';
import { useStore } from '../store';
import EmailCard from '../components/EmailCard';
import SwipeableRow from '../components/SwipeableRow';
import { dayBucket, longToday } from '../lib/time';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'starred', label: 'Starred' },
  { key: 'To Respond', label: 'To Respond' },
  { key: 'Meeting', label: 'Meeting' },
  { key: 'Notification', label: 'Notification' },
  { key: 'Newsletter', label: 'Newsletter' },
  { key: 'Promotions', label: 'Promotions' },
];

const SECTION_ORDER = ['Today', 'Yesterday', 'Earlier'];

export default function InboxScreen({ navigate, starred, openSheet }) {
  const { emails, counts, loading, refresh, markDone, archive, accounts } = useStore();
  const connected = accounts.outlook || accounts.gmail;
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const q = query.trim().toLowerCase();
  const base = starred ? emails.filter((e) => e.priority.isVip) : emails;

  const shown = base.filter((e) => {
    if (!starred) {
      if (filter === 'unread' && e.read !== false) return false;
      if (filter === 'urgent' && e.priority.bucket !== 'urgent') return false;
      if (filter === 'starred' && !e.priority.isVip) return false;
      if (['To Respond', 'Meeting', 'Notification', 'Newsletter', 'Promotions'].includes(filter) &&
        e.priority.category !== filter) return false;
    }
    if (q) {
      const hay = `${e.subject} ${e.priority.senderName} ${e.priority.senderEmail} ${e.priority.tldr}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Group into Today / Yesterday / Earlier sections.
  const grouped = {};
  shown.forEach((e) => {
    const key = dayBucket(e.date);
    (grouped[key] = grouped[key] || []).push(e);
  });
  const sections = SECTION_ORDER
    .filter((k) => grouped[k]?.length)
    .map((k) => ({ title: k === 'Today' ? `Today — ${longToday()}` : k, data: grouped[k] }));

  const unreadCount = emails.filter((e) => e.read === false).length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Navy header glow */}
      <LinearGradient colors={gradients.header} style={styles.glow} pointerEvents="none" />

      <SectionList
        sections={sections}
        keyExtractor={(e) => `${e.account}-${e.id}`}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#fff" />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <View>
                <Text style={styles.eyebrow}>{starred ? 'Mailbox' : "Cameron's Inbox"}</Text>
                <View style={styles.logoRow}>
                  <Text style={styles.logoScale}>Scale</Text>
                  <Text style={styles.logoMail}>Mail</Text>
                  {starred ? (
                    <Text style={styles.logoSuffix}>  Starred</Text>
                  ) : (
                    <Text style={styles.logoCount}>{` ·${unreadCount}`}</Text>
                  )}
                </View>
              </View>
              <Pressable style={styles.avatar} onPress={() => openSheet && openSheet('profile')}>
                <LinearGradient colors={gradients.avatar} style={styles.avatarFill}>
                  <Text style={styles.avatarText}>CG</Text>
                </LinearGradient>
              </Pressable>
            </View>

            {/* Search */}
            {searching ? (
              <View style={styles.searchActive}>
                <Ionicons name="search" size={16} color={colors.onDarkFaint} />
                <TextInput
                  style={styles.searchActiveInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search mail…"
                  placeholderTextColor={colors.onDarkFaint}
                  autoFocus
                />
                <Pressable hitSlop={8} onPress={() => { setSearching(false); setQuery(''); }}>
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.searchPill} onPress={() => setSearching(true)}>
                <Ionicons name="search" size={15} color={colors.onDarkFaint} />
                <Text style={styles.searchText}>Search mail…</Text>
              </Pressable>
            )}

            {/* Filter chips */}
            {!starred && !searching && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsWrap}
                contentContainerStyle={styles.chipsRow}
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
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {f.label}{f.key !== 'all' && count > 0 ? ` ${count}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionEyebrow}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <SwipeableRow
              onSwipeRight={() => markDone(item.id)}
              onSwipeLeft={() => archive(item.id)}
            >
              <EmailCard email={item} onPress={() => navigate('Detail', { id: item.id })} />
            </SwipeableRow>
          </View>
        )}
        ListEmptyComponent={
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
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 230 },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  header: { paddingHorizontal: 6, paddingTop: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  eyebrow: {
    fontSize: 12, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)', marginBottom: 6,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoScale: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -1.3 },
  logoMail: { fontSize: 32, fontWeight: '800', color: colors.blue, letterSpacing: -1.3 },
  logoCount: { fontSize: 32, fontWeight: '800', color: colors.blue, letterSpacing: -1.3, opacity: 0.7 },
  logoSuffix: { fontSize: 26, fontWeight: '800', color: colors.blue, letterSpacing: -1, opacity: 0.55 },
  avatar: { marginTop: 4 },
  avatarFill: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  searchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: colors.onDarkFill, borderWidth: 1, borderColor: colors.onDarkBorder,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15, marginBottom: 14,
  },
  searchText: { fontSize: 14, color: 'rgba(255,255,255,0.3)' },
  searchActive: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, paddingHorizontal: 12, marginBottom: 14,
  },
  searchActiveInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 11 },
  cancel: { color: colors.blue, fontSize: 15, fontWeight: '500' },
  chipsWrap: { marginBottom: 12, marginHorizontal: -6 },
  chipsRow: { gap: 7, paddingHorizontal: 6, paddingRight: 24 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  chipTextActive: { color: '#fff' },
  sectionEyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingTop: 10, paddingBottom: 10,
  },
  cardWrap: { marginBottom: 10 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.onDarkFill,
    borderWidth: 1, borderColor: colors.onDarkBorder, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.32)', textAlign: 'center' },
  connectBtn: { marginTop: 16, backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 24 },
  connectBtnText: { color: '#fff', fontWeight: '800', fontSize: font.body },
});
