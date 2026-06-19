// NextStepsCard.js — an AI "what should I do about this?" card shown under the
// email body: a one-line recommendation plus a few concrete next steps.

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { nextSteps } from '../lib/backend';

export default function NextStepsCard({ serverUrl, subject, body, senderName, dark }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    nextSteps(serverUrl, { subject, body, senderName })
      .then((r) => { if (alive) setData(r); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [subject]); // eslint-disable-line

  if (!loading && !(data && (data.recommendation || (data.steps || []).length))) return null;

  const s = dark ? darkStyles : styles;
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Ionicons name="sparkles" size={15} color={colors.blue} />
        <Text style={s.title}>Recommended next steps</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.blue} style={{ marginTop: 10 }} />
      ) : (
        <>
          {!!data.recommendation && <Text style={s.rec}>{data.recommendation}</Text>}
          {(data.steps || []).map((step, i) => (
            <View key={i} style={s.stepRow}>
              <View style={s.bullet}><Text style={s.bulletNum}>{i + 1}</Text></View>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const base = {
  card: { borderRadius: 16, padding: 16, marginTop: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '800', color: colors.blue, letterSpacing: 0.2 },
  rec: { fontSize: 15, lineHeight: 22, fontWeight: '600', marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  bullet: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  bulletNum: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 14.5, lineHeight: 21 },
};
const styles = StyleSheet.create({
  ...base,
  card: { ...base.card, backgroundColor: colors.blueLight, borderWidth: 1, borderColor: 'rgba(0,113,227,0.18)' },
  rec: { ...base.rec, color: colors.ink },
  stepText: { ...base.stepText, color: colors.ink2 },
});
const darkStyles = StyleSheet.create({
  ...base,
  card: { ...base.card, backgroundColor: 'rgba(0,113,227,0.14)', borderWidth: 1, borderColor: 'rgba(120,170,255,0.25)' },
  rec: { ...base.rec, color: '#fff' },
  stepText: { ...base.stepText, color: 'rgba(255,255,255,0.85)' },
});
