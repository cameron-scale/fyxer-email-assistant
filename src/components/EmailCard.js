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

function EmailCard({ email, onPress }) {
  const p = email.priority;
  const band = bandFor(email);
  const unread = email.read === false;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {/* Colored band */}
      <LinearGradient
        colors={band.grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.band}
      >
        <View style={styles.initialWrap}>
          <Text style={styles.initial}>{initials(p.senderName)}</Text>
        </View>
        <View style={styles.bandInfo}>
          <Text style={styles.bandName} numberOfLines={1}>{p.senderName}</Text>
          <Text style={styles.bandTime}>{timeAgo(email.date)}</Text>
        </View>
        {p.isVip && <Ionicons name="star" size={15} color={colors.star} style={styles.vip} />}
        {unread && <View style={styles.unreadDot} />}
      </LinearGradient>

      {/* Body */}
      <View style={styles.body}>
        <Text style={[styles.subject, !unread && styles.subjectRead]} numberOfLines={1}>
          {email.subject}
        </Text>
        <Text style={styles.preview} numberOfLines={2}>{p.tldr}</Text>
        <View style={styles.footer}>
          <View style={[styles.tag, { backgroundColor: band.tagBg }]}>
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
    height: 64,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  initialWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  initial: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: -0.5 },
  bandInfo: { flex: 1, paddingLeft: 10 },
  bandName: { color: 'rgba(255,255,255,0.96)', fontSize: 13.5, fontWeight: '700' },
  bandTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  vip: { marginRight: 8, marginBottom: 2 },
  unreadDot: {
    width: 9, height: 9, borderRadius: 5, backgroundColor: '#fff', opacity: 0.95, marginBottom: 3,
  },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  subject: { fontSize: 14, fontWeight: '600', color: colors.ink, letterSpacing: -0.2, marginBottom: 5 },
  subjectRead: { fontWeight: '500', color: colors.ink2 },
  preview: { fontSize: 13, color: colors.ink3, lineHeight: 19 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.02 },
});
