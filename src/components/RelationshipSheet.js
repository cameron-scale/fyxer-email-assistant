// RelationshipSheet.js — a mini sender profile: how much you've exchanged, what's
// awaiting your reply, and when you last interacted. Tap any sender avatar.

import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import Avatar from './Avatar';
import { relationship } from '../lib/backend';

const DEMO = { total: 38, received: 21, sent: 17, awaiting: 1, lastIso: new Date(Date.now() - 3600000).toISOString() };

function Stat({ value, label, color }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function RelationshipSheet({ visible, name, email, serverUrl, refreshToken, demo, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (demo) { setData(DEMO); return; }
    if (!refreshToken) { setData(null); return; }
    setLoading(true); setData(null);
    relationship(serverUrl, refreshToken, email)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [visible, email]); // eslint-disable-line

  if (!visible) return null;
  const last = data?.lastIso ? new Date(data.lastIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <Avatar name={name} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.email}>{email}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blue} style={{ marginVertical: 24 }} />
        ) : data ? (
          <>
            <View style={styles.stats}>
              <Stat value={data.total} label="Exchanged" />
              <Stat value={data.received} label="Received" />
              <Stat value={data.sent} label="Sent" />
            </View>
            {data.awaiting > 0 && (
              <View style={styles.awaiting}>
                <Ionicons name="alert-circle" size={16} color="#B45309" />
                <Text style={styles.awaitingText}>{data.awaiting} email{data.awaiting > 1 ? 's' : ''} awaiting your reply</Text>
              </View>
            )}
            <View style={styles.lastRow}>
              <Ionicons name="time-outline" size={15} color={colors.ink3} />
              <Text style={styles.lastText}>Last interaction · {last}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.empty}>Connect Outlook to see relationship insights.</Text>
        )}

        <Pressable style={styles.close} onPress={onClose}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.hairline, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  name: { fontSize: 18, fontWeight: '800', color: colors.ink },
  email: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  stats: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  awaiting: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF7E6', borderRadius: 12, padding: 12, marginTop: 12 },
  awaitingText: { color: '#92400E', fontSize: 13.5, fontWeight: '600' },
  lastRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  lastText: { color: colors.ink3, fontSize: 13 },
  empty: { color: colors.ink3, fontSize: 14, textAlign: 'center', marginVertical: 24 },
  close: { marginTop: 18, alignItems: 'center', paddingVertical: 12 },
  closeText: { color: colors.ink3, fontSize: 15, fontWeight: '600' },
});
