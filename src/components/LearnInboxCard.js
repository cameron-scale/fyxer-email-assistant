// LearnInboxCard.js — a one-time "learn my inbox" prompt shown after sign-in. It
// launches the full-screen learn overlay (the actual metadata scan + AI profiling
// lives in LearnInboxOverlay), so the app can prioritize better without
// summarizing thousands of emails.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';

export default function LearnInboxCard() {
  const { setPrefs, openLearn } = useStore();

  const dismiss = () => { setPrefs({ learnedInbox: true }); };

  return (
    <View style={styles.card}>
      <Pressable style={styles.dismiss} hitSlop={8} onPress={dismiss}><Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" /></Pressable>
      <View style={styles.headRow}>
        <View style={styles.iconWrap}><Ionicons name="sparkles" size={18} color="#fff" /></View>
        <Text style={styles.title}>Learn my inbox</Text>
      </View>
      <Text style={styles.body}>Let ScaleMail scan your past emails to spot your real VIP contacts and tailor your priorities. It's quick and cost-light — it studies who you talk to, not every message.</Text>
      <Pressable style={styles.cta} onPress={openLearn}><Text style={styles.ctaText}>Learn my old emails</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'rgba(0,113,227,0.16)', borderWidth: 1, borderColor: 'rgba(120,170,255,0.3)', borderRadius: 16, padding: 16, marginBottom: 14 },
  dismiss: { position: 'absolute', top: 10, right: 10, zIndex: 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 16, fontWeight: '800' },
  body: { color: 'rgba(255,255,255,0.8)', fontSize: 13.5, lineHeight: 20 },
  meta: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 6 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.blue },
  progressText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', marginTop: 8 },
  profile: { color: '#fff', fontSize: 14, lineHeight: 21, marginBottom: 10, fontStyle: 'italic' },
  subhead: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  vipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  vipChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, maxWidth: 160 },
  vipName: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
  addedNote: { color: '#5BD6A0', fontSize: 13, fontWeight: '600' },
  cta: { backgroundColor: colors.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  doneBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  doneText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
});
