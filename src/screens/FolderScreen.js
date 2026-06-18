// FolderScreen.js — shows the mail inside a folder opened from the drawer
// (Junk, Archive, custom folders…). Same cards as the inbox, grouped by day.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, SectionList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import EmailCard from '../components/EmailCard';
import { dayBucket, longToday } from '../lib/time';

const SECTION_ORDER = ['Today', 'Yesterday', 'Earlier'];

export default function FolderScreen({ goBack, navigate }) {
  const { folderEmails, currentFolder, folderLoading } = useStore();
  const list = folderEmails || [];

  const sections = useMemo(() => {
    const grouped = {};
    list.forEach((e) => { const k = dayBucket(e.date); (grouped[k] = grouped[k] || []).push(e); });
    return SECTION_ORDER.filter((k) => grouped[k]?.length)
      .map((k) => ({ title: k === 'Today' ? `Today — ${longToday()}` : k, data: grouped[k] }));
  }, [list]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text style={styles.backText}>Folders</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{currentFolder?.name || 'Folder'}</Text>
        <View style={{ width: 70 }} />
      </View>

      {folderLoading && !list.length ? (
        <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => `folder-${e.id}`}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => <Text style={styles.sectionEyebrow}>{section.title}</Text>}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <EmailCard email={item} onPress={() => navigate('Detail', { id: item.id })} />
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>This folder is empty.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  title: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  sectionEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingTop: 10, paddingBottom: 10 },
  cardWrap: { marginBottom: 10 },
  empty: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', marginTop: 60 },
});
