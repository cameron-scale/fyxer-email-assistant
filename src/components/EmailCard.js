// EmailCard.js — the ScaleMail-style inbox card: a white rounded card with a
// colored gradient "band" at the top (driven by the email's priority/category),
// the sender + time, an unread dot, then subject, 2-line preview and a tag pill.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, font } from '../theme';
import { bandFor } from '../lib/bands';
import { timeAgo } from '../lib/time';

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function EmailCard({ email, onPress, tagRef }) {
  const p = email.priority;
  const band = email.band || bandFor(email); // demo emails carry an explicit band
  const unread = email.read === false;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {/* Colored band — single dense row: avatar · name · time */}
      <LinearGradient
        colors={band.grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.band}
      >
        <View style={styles.initialWrap}>
          <Text style={styles.initial}>{initials(p.senderName)}</Text>
        </View>
        <Text style={styles.bandName} numberOfLines={1}>{p.senderName}</Text>
        {p.rank != null && (
          <View style={styles.rankPill}><Text style={styles.rankText}>{Number(p.rank).toFixed(1)}</Text></View>
        )}
        {p.isVip && <Ionicons name="star" size={13} color={colors.star} style={styles.vip} />}
        {unread && <View style={styles.unreadDot} />}
        <Text style={styles.bandTime} numberOfLines={1}>{timeAgo(email.date)}</Text>
      </LinearGradient>

      {/* Body */}
      <View style={styles.body}>
        <Text style={[styles.subject, !unread && styles.subjectRead]} numberOfLines={1}>
          {email.subject}
        </Text>
        <View style={styles.previewRow}>
          <Ionicons name="sparkles" size={11} color={colors.blue} style={styles.aiIcon} />
          <Text style={styles.preview} numberOfLines={2}>{p.tldr}</Text>
        </View>
        <View style={styles.footer}>
          <View ref={tagRef} collapsable={false} style={[styles.tag, { backgroundColor: band.tagBg }]}>
            <Text style={[styles.tagText, { color: band.tagColor }]}>{band.label}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(EmailCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: { transform: [{ scale: 0.975 }] },
  band: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  initialWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  initial: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: -0.5 },
  bandName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },
  rankPill: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, minWidth: 30, alignItems: 'center' },
  rankText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  bandTime: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '500', textAlign: 'right' },
  vip: { marginLeft: 2 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', opacity: 0.95,
  },
  body: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  subject: { fontSize: 14, fontWeight: '600', color: colors.ink, letterSpacing: -0.2, marginBottom: 4 },
  subjectRead: { fontWeight: '500', color: colors.ink2 },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start' },
  aiIcon: { marginTop: 3, marginRight: 5 },
  preview: { flex: 1, fontSize: 13, color: colors.ink3, lineHeight: 18, fontWeight: '400' },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.02 },
});
