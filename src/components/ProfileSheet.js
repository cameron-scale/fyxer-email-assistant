// ProfileSheet.js — the account/profile sheet (opened by the avatar), styled like
// the ScaleMail mockup: profile card, storage bar, and preference rows. The
// "Email Signature" and "Account" rows jump to the full Settings tab.

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors } from '../theme';
import { useStore } from '../store';
import { fetchUsage } from '../lib/backend';
import ProfileAvatar from './ProfileAvatar';

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

export default function ProfileSheet({ onClose, onOpenSettings, onOpenConnect, onOpenDigest, onOpenHealth }) {
  const { vips, prefs, setPrefs, updateAvatar, accounts, startTour, openLearn } = useStore();
  const [focused, setFocused] = useState(true);
  const [notifs, setNotifs] = useState(true);
  const [junk, setJunk] = useState(true);
  const [usage, setUsage] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Photo access needed', 'Allow photo access to set your profile picture.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (res.canceled) return;
      setPhotoBusy(true);
      const manip = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 360 } }], { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      const dataUri = `data:image/jpeg;base64,${manip.base64}`;
      await updateAvatar(dataUri);
      // The photo visibly updates everywhere in the app — that's the feedback.
      // We intentionally don't surface the M365-photo-sync result as an error: many
      // orgs block API photo changes, and the in-app avatar is what matters here.
    } catch (e) {
      Alert.alert('Could not set photo', e.message || 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  useEffect(() => {
    fetchUsage(prefs.serverUrl).then(setUsage).catch(() => {});
  }, [prefs.serverUrl]);

  const used = usage?.total ?? 0;
  const cap = usage?.cap ?? 1000;
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const monthName = usage ? new Date(`${usage.month}-01`).toLocaleString('en-US', { month: 'long' }) : '';

  const go = (fn) => { onClose(); setTimeout(fn, 260); };
  const chevron = <Ionicons name="chevron-forward" size={16} color={colors.ink4} />;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      <View style={styles.profileCard}>
        <Pressable onPress={pickAvatar}>
          <ProfileAvatar size={60} />
          <View style={styles.avEdit}>
            {photoBusy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={13} color="#fff" />}
          </View>
        </Pressable>
        <View>
          <Text style={styles.name}>Cameron Gallup</Text>
          <Text style={styles.email}>cameron@scalembs.com</Text>
          <Text style={styles.avHint}>Tap photo to change · shows when you email people</Text>
        </View>
      </View>

      <View style={styles.storage}>
        <Text style={styles.storageLabel}>
          AI usage{monthName ? ` · ${monthName}` : ''} · {used} of {cap} calls
        </Text>
        <View style={styles.bar}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: pct > 90 ? '#FF3B30' : colors.blue }]} />
        </View>
        <Text style={styles.storageNums}>
          {usage
            ? `${usage.summaries} summaries · ${usage.drafts} drafts · ${usage.signatures} signatures · ${usage.suggests} edits`
            : 'Loading usage…'}
        </Text>
      </View>

      <Text style={styles.section}>Insights</Text>
      <View style={styles.group}>
        <Row icon="calendar" bg="#E8F1FE" color="#1565C0" title="Calendar" onPress={() => go(onOpenCalendar)} right={chevron} />
        <Row icon="sunny" bg="#FFF7E6" color="#B45309" title="Today's digest" onPress={() => go(onOpenDigest)} right={chevron} />
        <Row icon="pulse" bg="#E8F8F1" color="#2E7D32" title="Inbox health" onPress={() => go(onOpenHealth)} right={chevron} />
      </View>

      <Text style={styles.section}>Account</Text>
      <View style={styles.group}>
        <Row icon="person" bg="#E3F2FD" color="#1565C0" title="Account & accounts" onPress={() => go(onOpenConnect)} right={chevron} />
        <Row icon="pencil" bg="#F3EEFF" color="#7C3AED" title="Signature & tone" onPress={() => go(onOpenSettings)} right={chevron} />
        <Row icon="star" bg="#FFF8E1" color="#C77D00" title={`VIP senders (${vips.length})`} onPress={() => go(onOpenSettings)} right={chevron} />
        <Row icon="sparkles" bg="#EAF1FF" color={colors.blue} title="Learn my old emails" onPress={() => go(openLearn)} right={chevron} />
      </View>

      <Text style={styles.section}>Preferences</Text>
      <View style={styles.group}>
        <Row icon="checkmark-circle" bg="#E8F5E9" color="#2E7D32" title="Focused Inbox" right={<Toggle value={focused} onChange={setFocused} />} />
        <Row icon="notifications" bg="#FFF7E6" color="#B45309" title="Notifications" right={<Toggle value={notifs} onChange={setNotifs} />} />
        <Row icon="chatbubbles" bg="#EAF1FF" color={colors.blue} title="Group conversations" right={<Toggle value={prefs.groupThreads !== false} onChange={(v) => setPrefs({ groupThreads: v })} />} />
        <Row icon="shield-checkmark" bg="#FDECEA" color="#C62828" title="Junk Filter" right={<Toggle value={junk} onChange={setJunk} />} />
        <Row icon="play-circle" bg="#E8F1FE" color={colors.blue} title="Replay tutorial" onPress={() => go(startTour)} right={chevron} />
      </View>

      <View style={{ height: 130 }} />
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
  avEdit: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avHint: { fontSize: 11, color: colors.ink4, marginTop: 4, maxWidth: 200 },
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
