// TabBar.js — the frosted bottom tab bar from the ScaleMail design.
// Tabs: Inbox · Starred · Triage · Sent · Drafts, with a raised blue compose
// (pencil) button in the middle that opens a slide-up sheet. Settings lives
// behind the profile avatar.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

const LEFT = [
  { key: 'Inbox', label: 'Inbox', icon: 'mail-outline', activeIcon: 'mail' },
  { key: 'Starred', label: 'Starred', icon: 'star-outline', activeIcon: 'star' },
  { key: 'Triage', label: 'Triage', icon: 'play-forward-outline', activeIcon: 'play-forward' },
];
const RIGHT = [
  { key: 'Sent', label: 'Sent', icon: 'paper-plane-outline', activeIcon: 'paper-plane' },
  { key: 'Drafts', label: 'Drafts', icon: 'document-text-outline', activeIcon: 'document-text' },
];

function Tab({ t, active, onNavigate, badge }) {
  const isActive = active === t.key;
  return (
    <Pressable style={styles.tab} onPress={() => onNavigate(t.key)}>
      <View>
        <Ionicons name={isActive ? t.activeIcon : t.icon} size={21} color={isActive ? colors.blue : colors.onDarkFaint} />
        {badge > 0 && (
          <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
        )}
      </View>
      <Text style={[styles.label, isActive && { color: colors.blue }]}>{t.label}</Text>
    </Pressable>
  );
}

export default function TabBar({ active, onNavigate, onCompose, inboxBadge = 0 }) {
  return (
    <View style={styles.bar}>
      {LEFT.map((t) => (
        <Tab key={t.key} t={t} active={active} onNavigate={onNavigate} badge={t.key === 'Inbox' ? inboxBadge : 0} />
      ))}
      <Pressable style={styles.composeWrap} onPress={onCompose}>
        <View style={styles.composeBtn}>
          <Ionicons name="pencil-sharp" size={21} color="#fff" />
        </View>
      </Pressable>
      {RIGHT.map((t) => (
        <Tab key={t.key} t={t} active={active} onNavigate={onNavigate} badge={0} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.tabBar,
    borderTopWidth: 1, borderTopColor: colors.onDarkBorder,
    paddingTop: 8, paddingBottom: 30, paddingHorizontal: 4,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  label: { fontSize: 9, fontWeight: '600', color: colors.onDarkFaint },
  badge: {
    position: 'absolute', top: -5, left: 12,
    backgroundColor: colors.blue, borderRadius: 8, minWidth: 15, height: 15,
    paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 8.5, fontWeight: '800' },
  composeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  composeBtn: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: colors.blue,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
});
