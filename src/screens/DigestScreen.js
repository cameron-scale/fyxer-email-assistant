// DigestScreen.js — a once-a-day narrative summary of your inbox ("Three urgent
// items need attention, two meetings today, five newsletters — nothing important").

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { digestNarrative } from '../lib/backend';

export default function DigestScreen({ goBack }) {
  const { emails, prefs } = useStore();
  const [digest, setDigest] = useState('');
  const [loading, setLoading] = useState(true);

  const byCat = useMemo(() => {
    const c = {};
    emails.forEach((e) => { const k = e.priority?.category || 'FYI'; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [emails]);
  const unread = emails.filter((e) => e.read === false).length;

  useEffect(() => {
    const items = emails.slice(0, 30).map((e) => ({ from: e.priority?.senderName, subject: e.subject, category: e.priority?.category, tldr: e.priority?.tldr }));
    setLoading(true);
    digestNarrative(prefs.serverUrl, items)
      .then((r) => setDigest(r.digest || ''))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}><Ionicons name="chevron-back" size={22} color={colors.blue} /><Text style={styles.backText}>Back</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>YOUR DIGEST</Text>
        <Text style={styles.h1}>Good morning ☕</Text>
        <Text style={styles.date}>{today}</Text>

        <View style={styles.card}>
          {loading ? <ActivityIndicator color={colors.blue} /> : (
            <Text style={styles.narrative}>{digest || 'Nothing notable in your inbox right now — you’re all caught up.'}</Text>
          )}
        </View>

        <Text style={styles.sectionLabel}>By the numbers</Text>
        <View style={styles.stats}>
          <Stat n={unread} label="Unread" />
          {Object.entries(byCat).slice(0, 4).map(([k, v]) => <Stat key={k} n={v} label={k} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
function Stat({ n, label }) {
  return <View style={styles.stat}><Text style={styles.statN}>{n}</Text><Text style={styles.statL}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  nav: { paddingHorizontal: 10, paddingVertical: 10 },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: colors.blue, fontSize: 16, fontWeight: '500' },
  body: { padding: 22 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.blue },
  h1: { fontSize: 28, fontWeight: '800', color: colors.ink, marginTop: 4 },
  date: { fontSize: 14, color: colors.ink3, marginTop: 2 },
  card: { backgroundColor: colors.surface2, borderRadius: 16, padding: 18, marginTop: 20, minHeight: 100, justifyContent: 'center' },
  narrative: { fontSize: 16, lineHeight: 25, color: colors.ink, fontFamily: 'Georgia' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.ink4, marginTop: 26, marginBottom: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', minWidth: 76 },
  statN: { fontSize: 22, fontWeight: '800', color: colors.ink },
  statL: { fontSize: 12, color: colors.ink3, marginTop: 2 },
});
