// HealthScreen.js — a weekly inbox "report card": volume, reply rate, what's
// piling up, and which categories dominate. Useful enough to change behavior.

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { healthStats } from '../lib/backend';
import { BANDS } from '../lib/bands';

export default function HealthScreen({ goBack }) {
  const { emails, prefs, outlookRefresh, accounts } = useStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accounts.outlook) { setLoading(false); return; }
    setLoading(true);
    healthStats(prefs.serverUrl, outlookRefresh).then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const cats = useMemo(() => {
    const c = {};
    emails.forEach((e) => { const k = e.priority?.category || 'FYI'; c[k] = (c[k] || 0) + 1; });
    const total = emails.length || 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: k, n: v, pct: Math.round((v / total) * 100) }));
  }, [emails]);

  const grade = stats ? (stats.replyRate >= 70 ? 'A' : stats.replyRate >= 50 ? 'B' : stats.replyRate >= 30 ? 'C' : 'D') : '—';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}><Ionicons name="chevron-back" size={22} color={colors.blue} /><Text style={styles.backText}>Back</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>THIS WEEK</Text>
        <Text style={styles.h1}>Inbox health</Text>

        {loading ? <ActivityIndicator color={colors.blue} style={{ marginTop: 30 }} /> : (
          <>
            <View style={styles.gradeCard}>
              <Text style={styles.gradeLetter}>{grade}</Text>
              <View>
                <Text style={styles.gradeLabel}>Reply rate</Text>
                <Text style={styles.gradeVal}>{stats ? `${stats.replyRate}%` : '—'}</Text>
              </View>
            </View>

            <View style={styles.row}>
              <Metric n={stats?.received7d ?? '—'} label="Received (7d)" />
              <Metric n={stats?.sent7d ?? '—'} label="Sent (7d)" />
              <Metric n={stats?.unread ?? '—'} label="Unread" />
            </View>

            <Text style={styles.sectionLabel}>What's in your inbox</Text>
            {cats.map((c) => {
              const color = (BANDS[c.name] || BANDS.FYI).tagColor;
              return (
                <View key={c.name} style={styles.barRow}>
                  <Text style={styles.barName}>{c.name}</Text>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: `${c.pct}%`, backgroundColor: color }]} /></View>
                  <Text style={styles.barPct}>{c.n}</Text>
                </View>
              );
            })}
            {!accounts.outlook && <Text style={styles.note}>Connect Outlook for full weekly stats.</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
function Metric({ n, label }) {
  return <View style={styles.metric}><Text style={styles.metricN}>{n}</Text><Text style={styles.metricL}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  nav: { paddingHorizontal: 10, paddingVertical: 10 },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: colors.blue, fontSize: 16, fontWeight: '500' },
  body: { padding: 22 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.blue },
  h1: { fontSize: 28, fontWeight: '800', color: colors.ink, marginTop: 4 },
  gradeCard: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: colors.surface2, borderRadius: 16, padding: 20, marginTop: 20 },
  gradeLetter: { fontSize: 52, fontWeight: '900', color: colors.blue },
  gradeLabel: { fontSize: 13, color: colors.ink3 },
  gradeVal: { fontSize: 26, fontWeight: '800', color: colors.ink },
  row: { flexDirection: 'row', gap: 12, marginTop: 14 },
  metric: { flex: 1, backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  metricN: { fontSize: 22, fontWeight: '800', color: colors.ink },
  metricL: { fontSize: 11.5, color: colors.ink3, marginTop: 3, textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.ink4, marginTop: 28, marginBottom: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  barName: { width: 96, fontSize: 13, color: colors.ink2, fontWeight: '500' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barPct: { width: 28, textAlign: 'right', fontSize: 13, color: colors.ink3, fontWeight: '600' },
  note: { fontSize: 13, color: colors.ink3, marginTop: 16 },
});
