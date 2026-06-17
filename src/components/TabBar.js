// TabBar.js — the frosted bottom tab bar from the ScaleMail design.
// Inbox · Starred · (Compose) · Zip · Settings, with a raised blue compose button
// in the middle. "Zip" is Brisk's signature swipe-deck triage mode.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, font } from '../theme';

const TABS = [
  { key: 'Inbox', label: 'Inbox', icon: 'mail-outline', activeIcon: 'mail' },
  { key: 'Starred', label: 'Starred', icon: 'star-outline', activeIcon: 'star' },
  { key: 'Compose', label: '', icon: 'create', compose: true },
  { key: 'Triage', label: 'Zip', icon: 'flash-outline', activeIcon: 'flash' },
  { key: 'Settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

export default function TabBar({ active, onNavigate, inboxBadge = 0 }) {
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        if (t.compose) {
          return (
            <Pressable key={t.key} style={styles.composeWrap} onPress={() => onNavigate('Compose')}>
              <View style={styles.composeBtn}>
                <Ionicons name="create-outline" size={22} color="#fff" />
              </View>
            </Pressable>
          );
        }
        const isActive = active === t.key;
        return (
          <Pressable key={t.key} style={styles.tab} onPress={() => onNavigate(t.key)}>
            <View>
              <Ionicons
                name={isActive ? t.activeIcon : t.icon}
                size={23}
                color={isActive ? colors.blue : colors.onDarkFaint}
              />
              {t.key === 'Inbox' && inboxBadge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{inboxBadge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, isActive && { color: colors.blue }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.tabBar,
    borderTopWidth: 1, borderTopColor: colors.onDarkBorder,
    paddingTop: 8, paddingBottom: 30, paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  label: { fontSize: 10, fontWeight: '600', color: colors.onDarkFaint },
  badge: {
    position: 'absolute', top: -4, left: 14,
    backgroundColor: colors.blue, borderRadius: 8, minWidth: 16, height: 16,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  composeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  composeBtn: {
    width: 50, height: 50, borderRadius: 16, backgroundColor: colors.blue,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
});
