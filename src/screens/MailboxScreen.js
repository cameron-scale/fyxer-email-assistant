// MailboxScreen.js — the Sent and Drafts tabs. Fetches the real Graph folder
// (Sent Items / Drafts) and lists it with the same cards as the inbox.

import React, { useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, SectionList, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius } from '../theme';
import { useStore } from '../store';
import { prioritize } from '../lib/priority';
import EmailCard from '../components/EmailCard';
import ProfileAvatar from '../components/ProfileAvatar';
import { dayBucket, longToday } from '../lib/time';

const COPY = {
  Sent: { key: 'sent', suffix: 'Sent', icon: 'paper-plane-outline', title: 'No sent mail yet', sub: 'Messages you send will appear here.' },
  Drafts: { key: 'drafts', suffix: 'Drafts', icon: 'document-text-outline', title: 'No drafts', sub: 'Start a message with the compose button and it’ll be saved here.' },
};
const SECTION_ORDER = ['Today', 'Yesterday', 'Earlier'];

export default function MailboxScreen({ navigate, route, openSheet }) {
  const c = COPY[route] || COPY.Sent;
  const { folders, folderLoading, loadFolder, vips, accounts } = useStore();
  const list = folders[c.key] || [];

  useEffect(() => {
    if (accounts.outlook) loadFolder(c.key);
  }, [c.key, accounts.outlook]); // eslint-disable-line react-hooks/exhaustive-deps

  const ranked = useMemo(() => prioritize(list, vips), [list, vips]);
  const sections = useMemo(() => {
    const grouped = {};
    ranked.forEach((e) => { const k = dayBucket(e.date); (grouped[k] = grouped[k] || []).push(e); });
    return SECTION_ORDER.filter((k) => grouped[k]?.length)
      .map((k) => ({ title: k === 'Today' ? `Today — ${longToday()}` : k, data: grouped[k] }));
  }, [ranked]);

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={gradients.header} style={styles.glow} pointerEvents="none" />
      <SectionList
        sections={sections}
        keyExtractor={(e) => `${c.key}-${e.id}`}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={folderLoading} onRefresh={() => loadFolder(c.key)} tintColor="#fff" />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Mailbox</Text>
              <View style={styles.logoRow}>
                <Text style={styles.logoScale}>Scale</Text>
                <Text style={styles.logoMail}>Mail</Text>
                <Text style={styles.logoSuffix}>{`  ${c.suffix}`}</Text>
              </View>
            </View>
            <Pressable style={styles.avatar} onPress={() => openSheet && openSheet('profile')}>
              <ProfileAvatar size={40} />
            </Pressable>
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionEyebrow}>{section.title}</Text>}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <EmailCard email={item} onPress={() => navigate('Detail', { id: item.id })} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name={c.icon} size={28} color={colors.onDarkFaint} /></View>
            <Text style={styles.emptyTitle}>{accounts.outlook ? c.title : 'Connect your email'}</Text>
            <Text style={styles.emptySub}>{accounts.outlook ? c.sub : 'Tap the profile icon to connect Outlook.'}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 230 },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 6, paddingTop: 4, marginBottom: 14 },
  eyebrow: { fontSize: 12, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoScale: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -1.1 },
  logoMail: { fontSize: 28, fontWeight: '800', color: colors.blue, letterSpacing: -1.1 },
  logoSuffix: { fontSize: 22, fontWeight: '800', color: colors.blue, letterSpacing: -0.9, opacity: 0.55 },
  avatar: { marginTop: 4 },
  avatarFill: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionEyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingTop: 10, paddingBottom: 10,
  },
  cardWrap: { marginBottom: 10 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40, paddingTop: 80 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.onDarkFill,
    borderWidth: 1, borderColor: colors.onDarkBorder, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.32)', textAlign: 'center', lineHeight: 20 },
});
