// LearnInboxCard.js — a one-time "learn my inbox" card shown after sign-in. It
// asks the AI to scan past emails (cheaply — metadata only + one profiling call)
// and suggest VIP contacts + a short profile, so the app can prioritize better
// without summarizing thousands of emails.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { learnInbox } from '../lib/backend';

export default function LearnInboxCard() {
  const { prefs, setPrefs, vips, toggleVip, mailAccounts, activeAccountId, outlookRefresh } = useStore();
  const [state, setState] = useState('idle'); // idle | loading | done
  const [result, setResult] = useState(null);
  const [added, setAdded] = useState(false);

  const dismiss = () => setPrefs({ learnedInbox: true });

  const run = async () => {
    setState('loading');
    try {
      const acc = (mailAccounts || []).find((a) => a.id === activeAccountId) || (mailAccounts || [])[0];
      const rt = acc?.refreshToken || outlookRefresh;
      const provider = acc?.type || 'outlook';
      const r = await learnInbox(prefs.serverUrl, rt, provider, 3000);
      // Don't re-suggest people who are already VIPs.
      const have = new Set((vips || []).map((v) => String(v).toLowerCase()));
      r.suggestedVips = (r.suggestedVips || []).filter((v) => !have.has(v.email));
      setResult(r);
      setState('done');
    } catch (e) {
      setResult({ error: e.message || 'Could not learn your inbox' });
      setState('done');
    }
  };

  const addVips = () => {
    (result?.suggestedVips || []).forEach((v) => toggleVip(v.email));
    setAdded(true);
  };

  if (state === 'idle') {
    return (
      <View style={styles.card}>
        <Pressable style={styles.dismiss} hitSlop={8} onPress={dismiss}><Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" /></Pressable>
        <View style={styles.headRow}>
          <View style={styles.iconWrap}><Ionicons name="sparkles" size={18} color="#fff" /></View>
          <Text style={styles.title}>Learn my inbox</Text>
        </View>
        <Text style={styles.body}>Let ScaleMail scan your past emails to spot your real VIP contacts and tailor your priorities. It's quick and cost-light — it studies who you talk to, not every message.</Text>
        <Pressable style={styles.cta} onPress={run}><Text style={styles.ctaText}>Learn my old emails</Text></Pressable>
      </View>
    );
  }

  if (state === 'loading') {
    return (
      <View style={styles.card}>
        <View style={styles.headRow}><ActivityIndicator color="#fff" /><Text style={[styles.title, { marginLeft: 10 }]}>Studying your inbox…</Text></View>
        <Text style={styles.body}>Scanning your past emails to find your key contacts. This takes a few seconds.</Text>
      </View>
    );
  }

  // done
  return (
    <View style={styles.card}>
      <Pressable style={styles.dismiss} hitSlop={8} onPress={dismiss}><Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" /></Pressable>
      <View style={styles.headRow}>
        <View style={styles.iconWrap}><Ionicons name="checkmark" size={18} color="#fff" /></View>
        <Text style={styles.title}>Here's what I learned</Text>
      </View>
      {result?.error ? (
        <Text style={styles.body}>{result.error}</Text>
      ) : (
        <>
          {result?.processed > 0 && <Text style={styles.meta}>Studied {result.processed.toLocaleString()} emails</Text>}
          {!!result?.profile && <Text style={styles.profile}>{result.profile}</Text>}
          {(result?.suggestedVips || []).length > 0 ? (
            <>
              <Text style={styles.subhead}>Suggested VIPs</Text>
              <View style={styles.vipWrap}>
                {result.suggestedVips.map((v) => (
                  <View key={v.email} style={styles.vipChip}>
                    <Ionicons name="star" size={11} color="#F5A623" />
                    <Text style={styles.vipName} numberOfLines={1}>{v.name || v.email}</Text>
                  </View>
                ))}
              </View>
              {added ? (
                <Text style={styles.addedNote}>✓ Added as VIPs — they'll jump to the top.</Text>
              ) : (
                <Pressable style={styles.cta} onPress={addVips}><Text style={styles.ctaText}>Add all as VIPs</Text></Pressable>
              )}
            </>
          ) : (
            <Text style={styles.body}>No new VIP suggestions — your priorities are already tuned.</Text>
          )}
          <Pressable style={styles.doneBtn} onPress={dismiss}><Text style={styles.doneText}>Done</Text></Pressable>
        </>
      )}
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
