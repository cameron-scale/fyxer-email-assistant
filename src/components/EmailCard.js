// EmailCard.js — a flat, full-width inbox list row. Left to right: a 26px unread-dot
// column, a 3px category color strip + the sender avatar, then the content column
// (sender + time / subject / one-line AI preview), then an 8px spacer. No card
// chrome — just a hairline divider between rows.

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
  const stripColor = band.grad?.[0] || colors.blue; // category color (top of gradient)

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {/* 26px unread-dot column */}
      <View ref={tagRef} collapsable={false} style={styles.dotCol}>
        {selectMode ? (
          <View style={[styles.selDot, selected && styles.selDotOn]}>{selected && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
        ) : unread ? (
          <View style={styles.unreadDot} />
        ) : null}
      </View>

      {/* Category strip + avatar */}
      <View style={styles.stripAvatar}>
        <View style={[styles.strip, { backgroundColor: stripColor }]} />
        <SenderAvatar name={p.senderName} email={p.senderEmail} size={38} textStyle={styles.initial} />
      </View>

      {/* Content */}
      <View style={styles.main}>
        <View style={styles.topLine}>
          <Text style={[styles.sender, !unread && styles.senderRead]} numberOfLines={1}>{p.senderName}</Text>
          {p.isVip && <Ionicons name="star" size={12} color={colors.star} style={styles.vip} />}
          {threadCount > 1 && (
            <View style={styles.threadChip}>
              <Ionicons name="chatbubbles" size={9} color="rgba(255,255,255,0.7)" />
              <Text style={styles.threadChipText}>{threadCount}</Text>
            </View>
          )}
          {p.rank != null && (
            <View style={[styles.rankPill, { backgroundColor: `${stripColor}26` }]}>
              <Text style={[styles.rankText, { color: stripColor }]}>{Number(p.rank).toFixed(1)}</Text>
            </View>
          )}
          <Text style={styles.time} numberOfLines={1}>{timeAgo(email.date)}</Text>
        </View>
        <Text style={[styles.subject, !unread && styles.subjectRead]} numberOfLines={1}>{email.subject}</Text>
        <View style={styles.previewRow}>
          {p.aiSummarized && <Ionicons name="sparkles" size={10.5} color={colors.blue} style={styles.aiIcon} />}
          <Text style={styles.preview} numberOfLines={1}>{p.tldr}</Text>
        </View>
      </View>

      <View style={styles.rightSpacer} />
    </Pressable>
  );
}

export default React.memo(EmailCard);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  dotCol: { width: 26, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue },
  selDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  selDotOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  stripAvatar: { flexDirection: 'row', alignItems: 'center', marginRight: 11 },
  strip: { width: 3, height: 28, borderRadius: 2, marginRight: 8 },
  initial: { color: '#fff', fontWeight: '700', fontSize: 12 },
  main: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: 'row', alignItems: 'center' },
  sender: { flex: 1, color: 'rgba(255,255,255,0.95)', fontSize: 14, fontWeight: '600' },
  senderRead: { color: 'rgba(255,255,255,0.72)', fontWeight: '400' },
  vip: { marginHorizontal: 4 },
  threadChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 5, height: 16, marginLeft: 5 },
  threadChipText: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '800' },
  rankPill: { borderRadius: 7, paddingHorizontal: 6, height: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  rankText: { fontSize: 11, fontWeight: '800' },
  time: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '500', marginLeft: 6 },
  subject: { color: 'rgba(255,255,255,0.80)', fontSize: 13, fontWeight: '500', marginTop: 2 },
  subjectRead: { color: 'rgba(255,255,255,0.60)', fontWeight: '400' },
  previewRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  aiIcon: { marginRight: 4 },
  preview: { flex: 1, color: 'rgba(255,255,255,0.62)', fontSize: 12, fontWeight: '400' },
  rightSpacer: { width: 8 },
});
