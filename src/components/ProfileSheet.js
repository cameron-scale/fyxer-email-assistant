// ProfileSheet.js — the account/profile sheet (opened by the avatar), styled like
// the ScaleMail mockup: profile card, storage bar, and preference rows. The
// "Email Signature" and "Account" rows jump to the full Settings tab.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../theme';
import { useStore } from '../store';

function Toggle({ value, onChange }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={[styles.toggle, value && styles.toggleOn]}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

function Row({ icon, bg, color, title, onPress, right }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowLeft}>
        <View style={[styles.rowIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      {right}
    </Pressable>
  );
}

export default function ProfileSheet({ onClose, onOpenSettings, onOpenConnect }) {
  const { vips } = useStore();
  const [focused, setFocused] = useState(true);
  const [notifs, setNotifs] = useState(true);
  const [junk, setJunk] = useState(true);

  const go = (fn) => { onClose(); setTimeout(fn, 260); };
  const chevron = <Ionicons name="chevron-forward" size={16} color={colors.ink4} />;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      <View style={styles.profileCard}>
        <LinearGradient colors={gradients.avatar} style={styles.av}>
          <Text style={styles.avText}>CG</Text>
        </LinearGradient>
        <View>
          <Text style={styles.name}>Cameron Gallup</Text>
          <Text style={styles.email}>cameron@scalembs.com</Text>
        </View>
      </View>

      <View style={styles.storage}>
        <Text style={styles.storageLabel}>Mailbox storage · 6.9 GB of 15 GB used</Text>
        <View style={styles.bar}><View style={styles.fill} /></View>
        <Text style={styles.storageNums}>6.9 GB used · 8.1 GB available</Text>
      </View>

      <Text style={styles.section}>Account</Text>
      <View style={styles.group}>
        <Row icon="person" bg="#E3F2FD" color="#1565C0" title="Account & accounts" onPress={() => go(onOpenConnect)} right={chevron} />
        <Row icon="pencil" bg="#F3EEFF" color="#7C3AED" title="Signature & tone" onPress={() => go(onOpenSettings)} right={chevron} />
        <Row icon="star" bg="#FFF8E1" color="#C77D00" title={`VIP senders (${vips.length})`} onPress={() => go(onOpenSettings)} right={chevron} />
      </View>

      <Text style={styles.section}>Preferences</Text>
      <View style={styles.group}>
        <Row icon="checkmark-circle" bg="#E8F5E9" color="#2E7D32" title="Focused Inbox" right={<Toggle value={focused} onChange={setFocused} />} />
        <Row icon="notifications" bg="#FFF7E6" color="#B45309" title="Notifications" right={<Toggle value={notifs} onChange={setNotifs} />} />
        <Row icon="shield-checkmark" bg="#FDECEA" color="#C62828" title="Junk Filter" right={<Toggle value={junk} onChange={setJunk} />} />
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 22, paddingTop: 16 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  av: {
    width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  avText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  email: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  storage: { marginBottom: 6 },
  storageLabel: { fontSize: 12, color: colors.ink4, marginBottom: 6 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.hairline, overflow: 'hidden' },
  fill: { height: '100%', width: '43%', borderRadius: 3, backgroundColor: colors.blue },
  storageNums: { fontSize: 11, color: colors.ink4, marginTop: 4 },
  section: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
    color: colors.ink4, marginTop: 22, marginBottom: 8,
  },
  group: { backgroundColor: colors.surface2, borderRadius: 14, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: colors.hairline, justifyContent: 'center', paddingHorizontal: 3 },
  toggleOn: { backgroundColor: '#34C759' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  knobOn: { transform: [{ translateX: 20 }] },
});
