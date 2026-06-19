// EmailCard.js — a clean inbox list row (Apple Mail / Spark style): a small
// colored priority dot, the sender's avatar, the sender + time, then the subject
// and a 2-line AI preview. The dot's color comes from the email's category so the
// priority/category is readable at a glance without a heavy colored band.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { bandFor } from '../lib/bands';
import { timeAgo } from '../lib/time';
import SenderAvatar from './SenderAvatar';

function EmailCard({ email, onPress, onLongPress, tagRef, selectMode, selected }) {
  const p = email.priority;
  const band = email.band || bandFor(email); // demo emails carry an explicit band
  const unread = email.read === false;
  const threadCount = email.threadCount || 1;
  const dotColor = band.grad?.[0] || colors.blue; // category color

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => [styles.row, unread && styles.rowUnread, selected && styles.rowSelected, pressed && styles.pressed]}>
      {/* Priority/category dot — shown only for unread, so read rows stay calm */}
      <View ref={tagRef} collapsable={false} style={styles.dotCol}>
        {selectMode ? (
          <View style={[styles.selDot, selected && styles.selDotOn]}>{selected && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
        ) : unread ? (
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
        ) : null}
      </View>

      <SenderAvatar name={p.senderName} email={p.senderEmail} size={40} textStyle={styles.initial} />

      <View style={styles.main}>
        <View style={styles.topLine}>
          <Text style={[styles.sender, !unread && styles.senderRead]} numberOfLines={1}>{p.senderName}</Text>
          {p.isVip && <Ionicons name="star" size={12} color={colors.star} style={styles.vip} />}
          {threadCount > 1 && (
            <View style={styles.threadPill}><Ionicons name="chatbubbles" size={9} color="rgba(255,255,255,0.6)" /><Text style={styles.threadText}>{threadCount}</Text></View>
          )}
          <Text style={styles.time} numberOfLines={1}>{timeAgo(email.date)}</Text>
        </View>
        <Text style={[styles.subject, !unread && styles.subjectRead]} numberOfLines={1}>{email.subject}</Text>
        <View style={styles.previewRow}>
          {p.aiSummarized && <Ionicons name="sparkles" size={11} color={colors.blue} style={styles.aiIcon} />}
          <Text style={[styles.preview, !unread && styles.previewRead]} numberOfLines={2}>{p.tldr}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(EmailCard);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 13,
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowUnread: { backgroundColor: 'rgba(120,170,255,0.07)' }, // unread rows get a faint tint so they pop
  rowSelected: { backgroundColor: 'rgba(0,113,227,0.14)' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  dotCol: { width: 10, alignItems: 'center', paddingTop: 16 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  selDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  selDotOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  initial: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: -0.5 },
  main: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sender: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  senderRead: { color: 'rgba(255,255,255,0.52)', fontWeight: '500' },
  vip: { marginLeft: -2 },
  threadPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 5, height: 17 },
  threadText: { color: 'rgba(255,255,255,0.7)', fontSize: 10.5, fontWeight: '800' },
  time: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '500' },
  subject: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.2, marginTop: 2 },
  subjectRead: { fontWeight: '500', color: 'rgba(255,255,255,0.5)' },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 3 },
  aiIcon: { marginTop: 2.5, marginRight: 5 },
  preview: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 18, fontWeight: '400' },
  previewRead: { color: 'rgba(255,255,255,0.4)' },
});
