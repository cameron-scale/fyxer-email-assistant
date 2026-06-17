// SettingsScreen.js — one place to control how Brisk behaves: your signature,
// default reply tone, and the VIP senders you've taught it about.
import React from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';

const TONES = [
  { key: 'professional', label: 'Professional' },
  { key: 'friendly', label: 'Friendly' },
  { key: 'brief', label: 'Brief' },
];

export default function SettingsScreen({ goBack, navigate }) {
  const { prefs, setPrefs, vips, toggleVip, accounts } = useStore();
  const connected = ['gmail', 'outlook'].filter((a) => accounts[a]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable style={styles.backRow} onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
          <Text style={styles.backText}>Inbox</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Settings</Text>

        {/* Signature */}
        <Text style={styles.section}>Your signature</Text>
        <Text style={styles.help}>Used to sign every quick reply.</Text>
        <TextInput
          style={styles.input}
          value={prefs.signature}
          onChangeText={(t) => setPrefs({ signature: t })}
          placeholder="Your name"
          placeholderTextColor={colors.textFaint}
        />

        {/* Default tone */}
        <Text style={styles.section}>Default reply tone</Text>
        <Text style={styles.help}>How your one-tap drafts sound by default.</Text>
        <View style={styles.chips}>
          {TONES.map((t) => {
            const active = prefs.tone === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setPrefs({ tone: t.key })}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* VIPs */}
        <Text style={styles.section}>VIP senders ⭐</Text>
        <Text style={styles.help}>
          Email from these people always jumps to the top. Tap the star on any email to add
          someone.
        </Text>
        {vips.length === 0 ? (
          <View style={styles.emptyVip}>
            <Text style={styles.emptyVipText}>No VIPs yet. Star a sender to teach Brisk who matters.</Text>
          </View>
        ) : (
          vips.map((email) => (
            <View key={email} style={styles.vipRow}>
              <Ionicons name="star" size={16} color={colors.important} />
              <Text style={styles.vipEmail} numberOfLines={1}>{email}</Text>
              <Pressable hitSlop={10} onPress={() => toggleVip(email)}>
                <Ionicons name="close-circle" size={20} color={colors.textFaint} />
              </Pressable>
            </View>
          ))
        )}

        {/* Accounts */}
        <Text style={styles.section}>Accounts</Text>
        <Pressable style={styles.linkRow} onPress={() => navigate('Connect')}>
          <Ionicons name="person-circle-outline" size={22} color={colors.brand} />
          <Text style={styles.linkText}>
            {connected.length ? `Manage (${connected.join(', ')})` : 'Connect Gmail / Outlook'}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
        </Pressable>

        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={15} color={colors.fyi} />
          <Text style={styles.privacyText}>
            Brisk sorts everything on your device and only ever requests read access. Your
            VIPs, tone and signature are stored privately on this phone.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: space.md, paddingVertical: space.sm },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: colors.text, fontSize: font.title, fontWeight: '600' },
  body: { padding: space.lg, paddingBottom: 60 },
  h1: { color: colors.text, fontSize: font.h1, fontWeight: '800', marginBottom: space.sm },
  section: {
    color: colors.text, fontSize: font.title, fontWeight: '800',
    marginTop: space.xl, marginBottom: 4,
  },
  help: { color: colors.textDim, fontSize: font.small, marginBottom: space.md, lineHeight: 19 },
  input: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, color: colors.text, fontSize: font.body,
    paddingHorizontal: space.md, paddingVertical: 12,
  },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 16,
  },
  chipActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipText: { color: colors.textDim, fontWeight: '700', fontSize: font.small },
  chipTextActive: { color: colors.brand },
  emptyVip: {
    backgroundColor: colors.card, borderRadius: radius.md, padding: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  emptyVipText: { color: colors.textDim, fontSize: font.small, lineHeight: 19 },
  vipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: radius.md, padding: space.md,
    marginBottom: space.sm, borderWidth: 1, borderColor: colors.border,
  },
  vipEmail: { color: colors.text, fontSize: font.body, flex: 1 },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: radius.md, padding: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  linkText: { color: colors.text, fontSize: font.body, fontWeight: '600', flex: 1 },
  privacy: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.fyiSoft, borderRadius: radius.md, padding: space.md, marginTop: space.xl,
  },
  privacyText: { color: colors.textDim, fontSize: font.small, flex: 1, lineHeight: 19 },
});
