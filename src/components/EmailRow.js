// EmailRow.js — one tappable email in the inbox list.
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, radius, space, font } from '../theme';
import Avatar from './Avatar';
import PriorityPill from './PriorityPill';
import { timeAgo } from '../lib/time';

export default function EmailRow({ email, onPress }) {
  const p = email.priority;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={p.senderName} />
      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text style={[styles.sender, !email.read && styles.unread]} numberOfLines={1}>
            {p.senderName}
          </Text>
          <Text style={styles.time}>{timeAgo(email.date)}</Text>
        </View>
        <Text style={[styles.subject, !email.read && styles.unread]} numberOfLines={1}>
          {email.subject}
        </Text>
        <Text style={styles.tldr} numberOfLines={2}>
          {p.tldr}
        </Text>
        <View style={styles.metaRow}>
          <PriorityPill bucket={p.bucket} small />
          <Text style={styles.reason} numberOfLines={1}>
            {p.reason}
          </Text>
          {!email.read && <View style={styles.unreadDot} />}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.cardPressed, transform: [{ scale: 0.99 }] },
  body: { flex: 1, marginLeft: space.md },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sender: { color: colors.textDim, fontSize: font.small, fontWeight: '600', flex: 1 },
  time: { color: colors.textFaint, fontSize: font.tiny, marginLeft: 8 },
  subject: { color: colors.text, fontSize: font.title, fontWeight: '600', marginTop: 2 },
  unread: { color: colors.text, fontWeight: '800' },
  tldr: { color: colors.textDim, fontSize: font.small, marginTop: 4, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  reason: { color: colors.textFaint, fontSize: font.tiny, marginLeft: 8, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
