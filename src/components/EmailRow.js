// EmailRow.js — one tappable email in the inbox list.
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, font } from '../theme';
import Avatar from './Avatar';
import PriorityPill from './PriorityPill';
import { timeAgo } from '../lib/time';
import { useStore } from '../store';

const ACCOUNT_META = {
  gmail: { label: 'Gmail', color: '#EA4335' },
  outlook: { label: 'Outlook', color: '#0A84FF' },
  demo: { label: 'Demo', color: '#7A89B8' },
};

export default function EmailRow({ email, onPress }) {
  const { toggleVip, accounts } = useStore();
  const p = email.priority;
  const multiAccount = [accounts.gmail, accounts.outlook].filter(Boolean).length > 0;
  const acct = ACCOUNT_META[email.account];

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
          {multiAccount && acct && (
            <View style={[styles.acctBadge, { borderColor: acct.color }]}>
              <Text style={[styles.acctText, { color: acct.color }]}>{acct.label}</Text>
            </View>
          )}
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
          <View style={styles.category}>
            <Text style={styles.categoryText}>{p.category}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable
            hitSlop={10}
            onPress={() => toggleVip(p.senderEmail)}
            style={styles.star}
          >
            <Ionicons
              name={p.isVip ? 'star' : 'star-outline'}
              size={17}
              color={p.isVip ? colors.important : colors.textFaint}
            />
          </Pressable>
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
  topLine: { flexDirection: 'row', alignItems: 'center' },
  sender: { color: colors.textDim, fontSize: font.small, fontWeight: '600', flex: 1 },
  acctBadge: {
    borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1, marginHorizontal: 6,
  },
  acctText: { fontSize: font.tiny, fontWeight: '700' },
  time: { color: colors.textFaint, fontSize: font.tiny },
  subject: { color: colors.text, fontSize: font.title, fontWeight: '600', marginTop: 2 },
  unread: { color: colors.text, fontWeight: '800' },
  tldr: { color: colors.textDim, fontSize: font.small, marginTop: 4, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  category: {
    backgroundColor: colors.bgElevated, borderRadius: radius.pill,
    paddingHorizontal: 9, paddingVertical: 3, marginLeft: 6,
  },
  categoryText: { color: colors.textDim, fontSize: font.tiny, fontWeight: '700' },
  star: { padding: 2, marginRight: 8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
