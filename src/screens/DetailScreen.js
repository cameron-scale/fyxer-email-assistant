// DetailScreen.js — ScaleMail email reader: colored hero band, white subject bar
// with a category tag, a serif "letter" body, and a Brisk TL;DR callout. Replying
// opens a full-screen formal composer (ReplyScreen), not an inline chat bubble.

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';
import { bandFor } from '../lib/bands';

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Aurora palette for an open email, from its band/category.
const BAND_PALETTE = { urgent: 'urgent', clients: 'clients', work: 'work', meeting: 'meeting', finance: 'finance' };

export default function DetailScreen({ params, goBack, navigate }) {
  const { emails, archive, snooze, markRead, toggleVip, loadFullBody, setPalette } = useStore();
  const email = emails.find((e) => e.id === params.id);

  React.useEffect(() => {
    if (email && email.read === false) markRead(email.id);
  }, [email?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shift the aurora to match this email; restore default on leave.
  React.useEffect(() => {
    if (!email) return undefined;
    const band = bandFor(email);
    setPalette(email.priority?.isVip ? 'starred' : (BAND_PALETTE[band.key] || 'default'));
    return () => setPalette('default');
  }, [email?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The inbox list only carries a short preview; fetch the full body on open.
  React.useEffect(() => {
    if (email && loadFullBody) loadFullBody(email.id);
  }, [email?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!email) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.nav}>
          <Pressable style={styles.back} onPress={goBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={colors.blue} />
            <Text style={styles.backText}>Inbox</Text>
          </Pressable>
        </View>
        <Text style={styles.gone}>This message was moved. 👋</Text>
      </SafeAreaView>
    );
  }

  const p = email.priority;
  const band = bandFor(email);
  const act = (fn) => { fn(email.id); goBack(); };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav bar */}
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={colors.blue} />
          <Text style={styles.backText}>Inbox</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable style={styles.actionIcon} onPress={() => toggleVip(p.senderEmail)}>
            <Ionicons name={p.isVip ? 'star' : 'star-outline'} size={18} color={p.isVip ? '#FF9F0A' : colors.ink2} />
          </Pressable>
          <Pressable style={styles.actionIcon} onPress={() => act(snooze)}>
            <Ionicons name="time-outline" size={18} color={colors.ink2} />
          </Pressable>
          <Pressable style={styles.actionIcon} onPress={() => act(archive)}>
            <Ionicons name="archive-outline" size={18} color={colors.ink2} />
          </Pressable>
        </View>
      </View>

      {/* Colored hero */}
      <LinearGradient colors={band.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroInitial}>
          <Text style={styles.heroInitialText}>{initials(p.senderName)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroName} numberOfLines={1}>{p.senderName}</Text>
          <Text style={styles.heroAddr} numberOfLines={1}>{p.senderEmail}</Text>
        </View>
      </LinearGradient>

      {/* Subject + tags */}
      <View style={styles.subjectBar}>
        <Text style={styles.subject}>{email.subject}</Text>
        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: band.tagBg }]}>
            <Text style={[styles.tagText, { color: band.tagColor }]}>{band.label}</Text>
          </View>
          {p.isVip && (
            <View style={[styles.tag, { backgroundColor: '#FFF8E1' }]}>
              <Text style={[styles.tagText, { color: '#C77D00' }]}>⭐ VIP</Text>
            </View>
          )}
        </View>
      </View>

      {/* Body */}
      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.letter} showsVerticalScrollIndicator={false}>
        <View style={styles.tldrCard}>
          <View style={styles.tldrHead}>
            <Ionicons name="sparkles" size={13} color={colors.blue} />
            <Text style={styles.tldrLabel}>Scale Mail summary · {p.reason}</Text>
          </View>
          <Text style={styles.tldrText}>{p.tldr}</Text>
        </View>
        {(email.body || '').split('\n\n').map((para, i) => (
          <Text key={i} style={[styles.para, i === 0 && styles.salutation]}>{para}</Text>
        ))}
      </ScrollView>

      {/* Reply bar — opens the full-screen composer */}
      <View style={styles.replyBar}>
        <Pressable style={styles.replyBtn} onPress={() => navigate('Reply', { id: email.id })}>
          <Ionicons name="arrow-undo" size={18} color="#fff" />
          <Text style={styles.replyText}>Reply</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: colors.blue, fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  actionIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  hero: { height: 110, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22 },
  heroInitial: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroInitialText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  heroName: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
  heroAddr: { color: 'rgba(255,255,255,0.62)', fontSize: 12, marginTop: 3 },
  subjectBar: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  subject: { fontSize: 19, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, lineHeight: 25, marginBottom: 8 },
  tagsRow: { flexDirection: 'row', gap: 6 },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10.5, fontWeight: '700' },
  bodyScroll: { flex: 1, backgroundColor: colors.surface },
  letter: { padding: 24 },
  tldrCard: { backgroundColor: colors.blueLight, borderRadius: 14, padding: 14, marginBottom: 20 },
  tldrHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tldrLabel: { color: colors.blue, fontWeight: '700', fontSize: 12 },
  tldrText: { color: colors.ink2, fontSize: 14, lineHeight: 20 },
  para: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 27, color: colors.ink2, marginBottom: 18 },
  salutation: { color: colors.ink },
  replyBar: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface,
  },
  replyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15,
    shadowColor: colors.blue, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
  },
  replyText: { color: '#fff', fontSize: font.title, fontWeight: '800' },
  gone: { color: colors.ink3, textAlign: 'center', marginTop: 80, fontSize: 15 },
});
