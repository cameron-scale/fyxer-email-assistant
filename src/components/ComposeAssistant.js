// ComposeAssistant.js — an inline AI writing coach for the composer. Tap "Check
// writing" to get suggestions on grammar, spelling, conciseness, tone and
// persuasion. Apply them one at a time ("Make change") or all at once ("Fix all").

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { suggestEdits } from '../lib/backend';

const TYPE_META = {
  grammar: { color: '#7C3AED', icon: 'create-outline' },
  spelling: { color: '#D32F2F', icon: 'text-outline' },
  clarity: { color: '#0891B2', icon: 'bulb-outline' },
  tone: { color: '#D97706', icon: 'happy-outline' },
  persuasion: { color: '#059669', icon: 'megaphone-outline' },
};

export default function ComposeAssistant({ serverUrl, getBody, onApplyBody, context }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null); // { suggestions, improved }
  const [appliedAll, setAppliedAll] = useState(false);

  const run = async () => {
    const body = (getBody() || '').trim();
    if (!body) { Alert.alert('Write something first', 'Add a few lines and I’ll suggest improvements.'); return; }
    setLoading(true);
    setAppliedAll(false);
    try {
      const res = await suggestEdits(serverUrl, body, context);
      setData(res);
    } catch (e) {
      Alert.alert('Could not analyze', e.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const applyOne = (s, i) => {
    const body = getBody() || '';
    if (s.original && body.includes(s.original)) {
      onApplyBody(body.replace(s.original, s.replacement || ''));
      setData((d) => ({ ...d, suggestions: d.suggestions.filter((_, idx) => idx !== i) }));
    } else {
      Alert.alert(s.issue || 'Suggestion', s.advice || 'No automatic change available — apply manually.');
    }
  };

  const fixAll = () => {
    if (data?.improved) {
      onApplyBody(data.improved);
      setAppliedAll(true);
      setData((d) => ({ ...d, suggestions: [] }));
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Ionicons name="sparkles" size={15} color={colors.blue} />
          <Text style={styles.headText}>Writing suggestions</Text>
        </View>
        <Pressable style={styles.runBtn} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.runText}>{data ? 'Re-check' : 'Check writing'}</Text>}
        </Pressable>
      </View>

      {appliedAll && <Text style={styles.applied}>✓ Applied the improved version.</Text>}

      {data && data.suggestions?.length > 0 && (
        <>
          {data.suggestions.map((s, i) => {
            const meta = TYPE_META[s.type] || { color: colors.ink3, icon: 'ellipse-outline' };
            return (
              <View key={i} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={[styles.typeChip, { backgroundColor: `${meta.color}1A` }]}>
                    <Ionicons name={meta.icon} size={12} color={meta.color} />
                    <Text style={[styles.typeText, { color: meta.color }]}>{s.type}</Text>
                  </View>
                  {!!(s.original && s.replacement) && (
                    <Pressable style={styles.makeBtn} onPress={() => applyOne(s, i)}>
                      <Text style={styles.makeText}>Make change</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.issue}>{s.issue}</Text>
                <Text style={styles.advice}>{s.advice}</Text>
                {!!(s.original && s.replacement) && (
                  <Text style={styles.diff}>
                    <Text style={styles.diffOld}>{s.original}</Text>
                    {'  →  '}
                    <Text style={styles.diffNew}>{s.replacement}</Text>
                  </Text>
                )}
              </View>
            );
          })}
          {!!data.improved && (
            <Pressable style={styles.fixAll} onPress={fixAll}>
              <Ionicons name="checkmark-done" size={16} color="#fff" />
              <Text style={styles.fixAllText}>Fix all</Text>
            </Pressable>
          )}
        </>
      )}

      {data && data.suggestions?.length === 0 && !appliedAll && (
        <Text style={styles.clean}>Looks clean — no suggestions. ✨</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { fontSize: 13, fontWeight: '700', color: colors.ink2 },
  runBtn: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14, minWidth: 96, alignItems: 'center' },
  runText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  applied: { color: '#059669', fontSize: 13, marginTop: 10, fontWeight: '600' },
  clean: { color: colors.ink3, fontSize: 13, marginTop: 12 },
  card: { backgroundColor: colors.surface2, borderRadius: 12, padding: 12, marginTop: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 8 },
  typeText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  makeBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.blue, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12 },
  makeText: { color: colors.blue, fontWeight: '700', fontSize: 12 },
  issue: { fontSize: 14, fontWeight: '600', color: colors.ink },
  advice: { fontSize: 13, color: colors.ink2, marginTop: 2, lineHeight: 18 },
  diff: { fontSize: 12.5, marginTop: 8, lineHeight: 18 },
  diffOld: { color: '#C0392B', textDecorationLine: 'line-through' },
  diffNew: { color: '#059669', fontWeight: '600' },
  fixAll: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, marginTop: 12,
  },
  fixAllText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
