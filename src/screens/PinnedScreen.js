// PinnedScreen.js — a dedicated page for pinned emails (Outlook-style pin, but on
// its own page instead of stuck to the top of the inbox). Pin/unpin from a message's
// More menu; this page lists them newest-pinned first.

import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import EmailCard from '../components/EmailCard';

export default function PinnedScreen({ goBack, navigate }) {
  const { pinnedEmails, togglePin } = useStore();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text style={styles.backText}>Inbox</Text>
        </Pressable>
        <Text style={styles.title}>Pinned</Text>
        <View style={{ width: 70 }} />
      </View>

      <FlatList
        data={pinnedEmails}
        keyExtractor={(e) => `pin-${e.account}-${e.id}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <EmailCard
              email={item}
              onPress={() => navigate('Thread', { id: item.id })}
              onLongPress={() => togglePin(item.id)}
            />
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={44} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyTitle}>Nothing pinned yet</Text>
            <Text style={styles.emptySub}>Open any email → More → “Pin to Pinned page” to keep it here. Long-press a row here to unpin.</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,18,0.5)' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  title: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 120, flexGrow: 1 },
  cardWrap: { marginBottom: 10 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 100, paddingHorizontal: 40, gap: 10 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
