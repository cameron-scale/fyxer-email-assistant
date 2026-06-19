// LearnInboxCard.js — a one-time "learn my inbox" card shown after sign-in. It
// asks the AI to scan past emails (cheaply — metadata only + one profiling call)
// and suggest VIP contacts + a short profile, so the app can prioritize better
// without summarizing thousands of emails.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { learnScan, learnProfile } from '../lib/backend';

const SAFETY_CAP = 50000; // don't loop forever on a giant mailbox

export default function LearnInboxCard() {
  const { prefs, setPrefs, vips, toggleVip, mailAccounts, activeAccountId, outlookRefresh, mailboxTotal } = useStore();
  const [state, setState] = useState('idle'); // idle | loading | done
  const [result, setResult] = useState(null);
  const [added, setAdded] = useState(false);
  const [processed, setProcessed] = useState(0);
  const abortRef = React.useRef(false);

  const total = mailboxTotal && mailboxTotal > 0 ? Math.min(mailboxTotal, SAFETY_CAP) : null;

  const dismiss = () => { abortRef.current = true; setPrefs({ learnedInbox: true }); };

  const run = async () => {
    setState('loading');
    setProcessed(0);
    abortRef.current = false;
    const acc = (mailAccounts || []).find((a) => a.id === activeAccountId) || (mailAccounts || [])[0];
    const rt = acc?.refreshToken || outlookRefresh;
    const provider = acc?.type || 'outlook';
    const senders = {}; const subjects = []; let count = 0; let cursor = null;
    try {
      // Page through the whole mailbox (free metadata) with a live progress count.
      for (let i = 0; i < 1000 && !abortRef.current; i++) {
        const r = await learnScan(prefs.serverUrl, rt, provider, cursor);
        for (const [k, v] of Object.entries(r.senders || {})) { senders[k] = senders[k] || { name: v.name, count: 0 }; senders[k].count += v.count; }
        (r.subjects || []).forEach((s) => { if (subjects.length < 40) subjects.push(s); });
        count += r.processed || 0;
        setProcessed(count);
        cursor = r.cursor;
        if (r.done || !cursor || count >= SAFETY_CAP) break;
      }
      if (abortRef.current) return;
      // One cheap AI call to profile + suggest VIPs.
      const top = Object.entries(senders)
        .map(([email, v]) => ({ email, name: v.name, count: v.count }))
        .filter((s) => s.email.includes('@'))
        .sort((a, b) => b.count - a.count)
        .slice(0, 100);
      const p = await learnProfile(prefs.serverUrl, top, subjects);
      const have = new Set((vips || []).map((v) => String(v).toLowerCase()));
      const suggestedVips = (p.suggestedVips || []).filter((v) => !have.has(v.email));
      // Auto-feed the learned profile into prioritization right away — these senders
      // get boosted even before the user explicitly marks them as VIPs.
      const learned = (p.suggestedVips || [])
        .map((v) => String(v.email || '').toLowerCase().trim())
        .filter((e) => e.includes('@'));
      if (learned.length) {
        const existing = (prefs.knownImportant || []).map((e) => String(e).toLowerCase());
        const merged = Array.from(new Set([...existing, ...learned]));
        setPrefs({ knownImportant: merged });
      }
      setResult({ processed: count, profile: p.profile, suggestedVips });
      setState('done');
    } catch (e) {
      setResult({ error: e.message || 'Could not learn your inbox', processed: count });
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
    const pct = total ? Math.min(100, Math.round((processed / total) * 100)) : null;
    return (
      <View style={styles.card}>
        <View style={styles.headRow}><ActivityIndicator color="#fff" /><Text style={[styles.title, { marginLeft: 10 }]}>Studying your inbox…</Text></View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: pct != null ? `${pct}%` : '100%' }]} />
        </View>
        <Text style={styles.progressText}>
          {total ? `${processed.toLocaleString()} / ${total.toLocaleString()} emails profiled${pct != null ? ` · ${pct}%` : ''}`
            : `${processed.toLocaleString()} emails profiled…`}
        </Text>
        <Pressable style={styles.doneBtn} onPress={dismiss}><Text style={styles.doneText}>Stop</Text></Pressable>
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
