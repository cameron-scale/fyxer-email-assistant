// ArchivingSoonScreen.js — review the passive auto-archive queue. These are
// low-priority bulk emails staged to archive in 7 days. Keep the ones you want to
// hold onto, or archive the whole batch now.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, FlatList, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { timeAgo, nightlyArchiveEta } from '../lib/time';
import { bandFor } from '../lib/bands';
import SenderAvatar from '../components/SenderAvatar';

export default function ArchivingSoonScreen({ goBack, navigate }) {
  const { archivingSoon, archivingSoonCount, keepFromArchive, archiveStagedNow } = useStore();

  // Always show this queue most-important first, with the 1–10 score on each row.
  const sorted = useMemo(
    () => [...archivingSoon].sort((a, b) => (b.priority?.rank ?? b.priority?.score ?? 0) - (a.priority?.rank ?? a.priority?.score ?? 0)),
    [archivingSoon],
  );

  const archiveAll = () => {
    if (!archivingSoon.length) return;
    Alert.alert('Archive all now?', `Archive ${archivingSoonCount.toLocaleString()} emails. Nothing is deleted — you can find them in Archive.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive all', style: 'destructive', onPress: () => { archiveStagedNow(); goBack(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#fff" /><Text style={styles.backText}>Inbox</Text></Pressable>
        <Text style={styles.title}>Archiving soon</Text>
        <View style={{ width: 64 }} />
      </View>

      <View style={styles.banner}>
        <Ionicons name="time-outline" size={18} color="#F59E0B" />
        <Text style={styles.bannerText}>
          {archivingSoonCount.toLocaleString()} low-priority emails (7+ days old) archive tonight at 11:59 PM — in {nightlyArchiveEta()} — unless you keep them. Nothing is deleted.
        </Text>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(e) => `${e.account}-${e.id}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const strip = bandFor(item).grad?.[0] || colors.blue;
          const rank = item.priority?.rank;
          return (
            <Pressable style={styles.row} onPress={() => navigate('Thread', { id: item.id })}>
              <View style={[styles.strip, { backgroundColor: strip }]} />
              <SenderAvatar name={item.priority.senderName} email={item.priority.senderEmail} size={36} textStyle={styles.initial} />
              <View style={styles.main}>
                <View style={styles.topLine}>
                  <Text style={styles.sender} numberOfLines={1}>{item.priority.senderName}</Text>
                  {rank != null && (
                    <View style={[styles.rankPill, { backgroundColor: `${strip}26` }]}>
                      <Text style={[styles.rankText, { color: strip }]}>{Number(rank).toFixed(1)}</Text>
                    </View>
                  )}
                  <Text style={styles.time}>{timeAgo(item.date)}</Text>
                </View>
                <Text style={styles.subject} numberOfLines={1}>{item.subject}</Text>
              </View>
              <Pressable hitSlop={8} style={styles.keepBtn} onPress={() => keepFromArchive(item.id)}>
                <Ionicons name="checkmark" size={14} color="#34D399" />
                <Text style={styles.keepText}>Keep</Text>
              </Pressable>
            </Pressable>
          );
        }}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={44} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyTitle}>Nothing staged</Text>
            <Text style={styles.emptySub}>Bulk mail you don't act on will show up here, ready to clear.</Text>
          </View>
        )}
      />

      {archivingSoon.length > 0 && (
        <Pressable style={styles.archiveAll} onPress={archiveAll}>
          <Ionicons name="archive-outline" size={18} color="#fff" />
          <Text style={styles.archiveAllText}>Archive all {archivingSoonCount.toLocaleString()} now</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,18,0.5)' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, marginBottom: 8, padding: 13, borderRadius: 14, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)' },
  bannerText: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },
  list: { paddingHorizontal: 16, paddingBottom: 110 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  strip: { width: 3, height: 30, borderRadius: 2, marginRight: -4 },
  initial: { color: '#fff', fontWeight: '700', fontSize: 12 },
  main: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: 'row', alignItems: 'center' },
  sender: { flex: 1, color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' },
  rankPill: { borderRadius: 7, paddingHorizontal: 6, height: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  rankText: { fontSize: 11, fontWeight: '800' },
  time: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginLeft: 6 },
  subject: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 2 },
  keepBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16,185,129,0.16)', borderRadius: 14, paddingVertical: 7, paddingHorizontal: 11 },
  keepText: { color: '#34D399', fontSize: 12.5, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 40 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  archiveAll: { position: 'absolute', left: 16, right: 16, bottom: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F59E0B', borderRadius: 26, paddingVertical: 14, shadowColor: '#F59E0B', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  archiveAllText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
