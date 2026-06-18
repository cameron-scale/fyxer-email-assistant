// SettingsScreen.js — profile + controls, styled like the ScaleMail profile sheet.
// Manage your signature, default reply tone, VIP senders, and connected accounts.

import React from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, space, font, radius, gradients } from '../theme';
import { useStore } from '../store';
import { hasSignature } from '../lib/signature';
import ProfileAvatar from '../components/ProfileAvatar';

const TONES = [
  { key: 'professional', label: 'Professional' },
  { key: 'friendly', label: 'Friendly' },
  { key: 'brief', label: 'Brief' },
];

export default function SettingsScreen({ navigate, goBack }) {
  const { prefs, setPrefs, vips, toggleVip, accounts } = useStore();
  const connected = ['gmail', 'outlook'].filter((a) => accounts[a]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navBar}>
        <Pressable style={styles.backRow} onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.blue} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileCard}>
          <ProfileAvatar size={60} />
          <View>
            <Text style={styles.profileName}>Cameron Gallup</Text>
            <Text style={styles.profileEmail}>cameron@scalembs.com</Text>
          </View>
        </View>

        {/* Signature builder */}
        <Text style={styles.sectionLabel}>Email signature</Text>
        <Pressable style={styles.group} onPress={() => navigate('Signature')}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: '#F3EEFF' }]}>
              <Ionicons name="pencil" size={16} color="#7C3AED" />
            </View>
            <Text style={styles.rowTitle}>
              {hasSignature(prefs.sig) ? 'Edit signature' : 'Create your signature'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.ink4} />
          </View>
        </Pressable>

        {/* Custom categories */}
        <Text style={styles.sectionLabel}>Categories</Text>
        <Pressable style={styles.group} onPress={() => navigate('Categories')}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="pricetags" size={16} color="#4338CA" />
            </View>
            <Text style={styles.rowTitle}>Customize categories & rules</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.ink4} />
          </View>
        </Pressable>

        {/* Backend server */}
        <Text style={styles.sectionLabel}>Backend server URL</Text>
        <Text style={styles.help}>
          Paste your deployed server's address (e.g. https://brisk.onrender.com) to connect
          Outlook and turn on AI summaries. See server/README.md.
        </Text>
        <View style={styles.group}>
          <TextInput
            style={styles.input}
            value={prefs.serverUrl}
            onChangeText={(t) => setPrefs({ serverUrl: t.trim() })}
            placeholder="https://your-server.onrender.com"
            placeholderTextColor={colors.ink4}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        {/* Default tone */}
        <Text style={styles.sectionLabel}>Default reply tone</Text>
        <View style={styles.chips}>
          {TONES.map((t) => {
            const active = prefs.tone === t.key;
            return (
              <Pressable key={t.key} onPress={() => setPrefs({ tone: t.key })}
                style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* VIPs */}
        <Text style={styles.sectionLabel}>VIP senders ⭐</Text>
        <Text style={styles.help}>Star a sender on any email and they always jump to the top.</Text>
        {vips.length === 0 ? (
          <View style={styles.group}><Text style={styles.emptyVip}>No VIPs yet.</Text></View>
        ) : (
          <View style={styles.group}>
            {vips.map((email, i) => (
              <View key={email} style={[styles.row, i < vips.length - 1 && styles.rowBorder]}>
                <Ionicons name="star" size={16} color="#FF9F0A" />
                <Text style={styles.rowText} numberOfLines={1}>{email}</Text>
                <Pressable hitSlop={10} onPress={() => toggleVip(email)}>
                  <Ionicons name="close-circle" size={20} color={colors.ink4} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Accounts */}
        <Text style={styles.sectionLabel}>Accounts</Text>
        <Pressable style={styles.group} onPress={() => navigate('Connect')}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="person" size={16} color="#1565C0" />
            </View>
            <Text style={styles.rowTitle}>
              {connected.length ? `Manage (${connected.join(', ')})` : 'Connect Gmail / Outlook'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.ink4} />
          </View>
        </Pressable>

        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={14} color="#2E7D32" />
          <Text style={styles.privacyText}>
            Scale Mail sorts everything on your device and only ever requests read access. Your VIPs,
            tone and signature stay private on this phone.
          </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backText: { color: colors.blue, fontSize: 16, fontWeight: '500' },
  navTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  scroll: { padding: 22, paddingBottom: 120 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  profileAv: {
    width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  profileAvText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  profileName: { fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  profileEmail: { fontSize: 13, color: colors.ink3, marginTop: 3 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
    color: colors.ink4, marginTop: 26, marginBottom: 8,
  },
  help: { fontSize: 13, color: colors.ink3, marginBottom: 10, marginTop: -2, lineHeight: 18 },
  group: { backgroundColor: colors.surface2, borderRadius: 14, overflow: 'hidden' },
  input: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.ink },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 16 },
  chipActive: { backgroundColor: colors.blueLight },
  chipText: { color: colors.ink3, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: colors.blue },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 14, color: colors.ink },
  rowTitle: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '500' },
  emptyVip: { padding: 16, color: colors.ink3, fontSize: 14 },
  privacy: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#E8F8F1', borderRadius: 14, padding: 14, marginTop: 28,
  },
  privacyText: { flex: 1, color: colors.ink2, fontSize: 13, lineHeight: 19 },
});
