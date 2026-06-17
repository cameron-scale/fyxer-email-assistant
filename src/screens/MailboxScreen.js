// MailboxScreen.js — the Sent and Drafts tabs. This is a read-only preview build
// so there's no outgoing mail yet; these show the ScaleMail header + a tasteful
// empty state. Once a backend (and send/draft support) lands, they'll fill in.

import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../theme';

const COPY = {
  Sent: {
    suffix: 'Sent',
    icon: 'paper-plane-outline',
    title: 'No sent mail yet',
    sub: 'Sending is turned off in this read-only preview. Replies you draft are ready to copy into your mail app.',
  },
  Drafts: {
    suffix: 'Drafts',
    icon: 'document-text-outline',
    title: 'No drafts',
    sub: 'Start a message with the compose button and it’ll be saved here.',
  },
};

export default function MailboxScreen({ navigate, route, openSheet }) {
  const c = COPY[route] || COPY.Sent;
  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={gradients.header} style={styles.glow} pointerEvents="none" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Mailbox</Text>
          <View style={styles.logoRow}>
            <Text style={styles.logoScale}>Scale</Text>
            <Text style={styles.logoMail}>Mail</Text>
            <Text style={styles.logoSuffix}>{`  ${c.suffix}`}</Text>
          </View>
        </View>
        <Pressable style={styles.avatar} onPress={() => openSheet && openSheet('profile')}>
          <LinearGradient colors={gradients.avatar} style={styles.avatarFill}>
            <Text style={styles.avatarText}>CG</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name={c.icon} size={28} color={colors.onDarkFaint} />
        </View>
        <Text style={styles.emptyTitle}>{c.title}</Text>
        <Text style={styles.emptySub}>{c.sub}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 230 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 4 },
  eyebrow: { fontSize: 12, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoScale: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -1.1 },
  logoMail: { fontSize: 28, fontWeight: '800', color: colors.blue, letterSpacing: -1.1 },
  logoSuffix: { fontSize: 22, fontWeight: '800', color: colors.blue, letterSpacing: -0.9, opacity: 0.55 },
  avatar: { marginTop: 4 },
  avatarFill: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40, marginBottom: 80 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.onDarkFill,
    borderWidth: 1, borderColor: colors.onDarkBorder, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.32)', textAlign: 'center', lineHeight: 20 },
});
