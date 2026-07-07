// SnoozeSheet.js — pick when an email comes back, with an AI-suggested time based
// on what the email says (e.g. it mentions Friday's meeting → Thursday morning).

import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { snoozeSuggest } from '../lib/backend';

function atHour(date, h, m = 0) { const d = new Date(date); d.setHours(h, m, 0, 0); return d; }
function presets() {
  const now = new Date();
  const evening = atHour(now, 18); if (evening <= now) evening.setDate(evening.getDate() + 1);
  const tom = atHour(now, 8); tom.setDate(tom.getDate() + 1);
  const sat = atHour(now, 9); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
  const mon = atHour(now, 8); mon.setDate(mon.getDate() + ((1 - mon.getDay() + 7) % 7 || 7));
  return [
    { label: 'Later today', icon: 'time-outline', ts: now.getTime() + 3 * 3600000 },
    { label: 'This evening', icon: 'moon-outline', ts: evening.getTime() },
    { label: 'Tomorrow', icon: 'sunny-outline', ts: tom.getTime() },
    { label: 'This weekend', icon: 'cafe-outline', ts: sat.getTime() },
    { label: 'Next week', icon: 'calendar-outline', ts: mon.getTime() },
  ];
}
function when(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function SnoozeSheet({ visible, email, serverUrl, onClose, onSnooze }) {
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !email || email.demo) { setAi(null); return; }
    setLoading(true); setAi(null);
    snoozeSuggest(serverUrl, { subject: email.subject, body: email.body, now: new Date().toISOString() })
      .then((r) => { if (r.suggestion?.iso) setAi(r.suggestion); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, email?.id]); // eslint-disable-line

  if (!visible) return null;
  const opts = presets();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Snooze until…</Text>

        {(loading || ai) && (
          <Pressable
            style={[styles.row, styles.aiRow]}
            disabled={!ai}
            onPress={() => ai && onSnooze(new Date(ai.iso).getTime(), `Snoozed · ${ai.label}`)}
          >
            <Ionicons name="sparkles" size={18} color={colors.blue} />
            <View style={{ flex: 1 }}>
              <Text style={styles.aiLabel}>{loading ? 'Finding the best time…' : `AI: ${ai.label}`}</Text>
              {!!ai && <Text style={styles.aiWhen}>{when(new Date(ai.iso).getTime())}</Text>}
            </View>
            {loading ? <ActivityIndicator size="small" color={colors.blue} /> : <Ionicons name="chevron-forward" size={18} color={colors.blue} />}
          </Pressable>
        )}

        {opts.map((o) => (
          <Pressable key={o.label} style={styles.row} onPress={() => onSnooze(o.ts, `Snoozed · ${o.label}`)}>
            <Ionicons name={o.icon} size={18} color={colors.ink2} />
            <Text style={styles.rowLabel}>{o.label}</Text>
            <Text style={styles.rowWhen}>{when(o.ts)}</Text>
          </Pressable>
        ))}

        <Pressable style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 36 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.hairline, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowLabel: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '500' },
  rowWhen: { fontSize: 13, color: colors.ink3 },
  aiRow: { backgroundColor: colors.blueLight, borderRadius: 12, paddingHorizontal: 12, borderBottomWidth: 0, marginBottom: 6 },
  aiLabel: { fontSize: 15, color: colors.blue, fontWeight: '700' },
  aiWhen: { fontSize: 13, color: colors.blue, opacity: 0.8 },
  cancel: { marginTop: 14, alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: colors.ink3, fontSize: 15, fontWeight: '600' },
});
