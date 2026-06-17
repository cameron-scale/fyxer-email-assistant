// InboxScreen.js — the home screen. Shows your inbox sorted by priority.
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, space, font, radius, gradients } from '../theme';
import { useStore } from '../store';
import EmailRow from '../components/EmailRow';
import { BUCKETS } from '../lib/priority';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'important', label: 'Important' },
  { key: 'fyi', label: 'FYI' },
  { key: 'noise', label: 'Noise' },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function InboxScreen({ navigate }) {
  const { emails, counts, loading, refresh, accounts } = useStore();
  const [filter, setFilter] = useState('all');

  const shown = filter === 'all' ? emails : emails.filter((e) => e.priority.bucket === filter);
  const topJob = counts.urgent + counts.important;

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={shown}
        keyExtractor={(e) => `${e.account}-${e.id}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.brand} />
        }
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.hello}>{greeting()} 👋</Text>
                <Text style={styles.h1}>Your priority inbox</Text>
              </View>
              <Pressable style={styles.accountBtn} onPress={() => navigate('Connect')}>
                <Ionicons name="person-circle-outline" size={30} color={colors.text} />
              </Pressable>
            </View>

            {/* Summary card */}
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
              <Text style={styles.summaryBig}>
                {topJob === 0 ? "You're all caught up 🎉" : `${topJob} email${topJob > 1 ? 's' : ''} need you`}
              </Text>
              <Text style={styles.summarySub}>
                {counts.urgent} urgent · {counts.important} important · {counts.total} total
              </Text>
              {emails.length > 0 && (
                <Pressable style={styles.zipBtn} onPress={() => navigate('Triage')}>
                  <Ionicons name="flash" size={16} color={colors.brand} />
                  <Text style={styles.zipText}>Zip through them</Text>
                </Pressable>
              )}
            </LinearGradient>

            {/* Filters */}
            <View style={styles.filters}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const c = f.key === 'all' ? colors.brand : colors[BUCKETS[f.key].colorKey];
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={[styles.chip, active && { backgroundColor: c, borderColor: c }]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {f.label}
                      {f.key !== 'all' && counts[f.key] > 0 ? ` ${counts[f.key]}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <EmailRow email={item} onPress={() => navigate('Detail', { id: item.id })} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🍃</Text>
            <Text style={styles.emptyText}>Nothing here. Inbox zero feels good.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: space.lg, paddingBottom: 120 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginTop: space.sm, marginBottom: space.md,
  },
  hello: { color: colors.textDim, fontSize: font.body },
  h1: { color: colors.text, fontSize: font.h1, fontWeight: '800', marginTop: 2 },
  accountBtn: { padding: 4 },
  summary: { borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg },
  summaryBig: { color: '#fff', fontSize: font.h2, fontWeight: '800' },
  summarySub: { color: 'rgba(255,255,255,0.85)', fontSize: font.small, marginTop: 6 },
  zipBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: '#fff', borderRadius: radius.pill,
    paddingVertical: 9, paddingHorizontal: 16, marginTop: space.md, gap: 6,
  },
  zipText: { color: colors.brand, fontWeight: '800', fontSize: font.small },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.md },
  chip: {
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated,
  },
  chipText: { color: colors.textDim, fontWeight: '700', fontSize: font.small },
  chipTextActive: { color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyText: { color: colors.textDim, fontSize: font.body },
});
