// ConnectScreen.js — connect Gmail / Outlook / iCloud, or stay in demo mode.
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';
import { useProviders } from '../auth/useProviders';
import { isConfigured } from '../auth/authConfig';

export default function ConnectScreen({ goBack }) {
  const { accounts, loadAccount, disconnect } = useStore();
  const { connectGoogle, connectMicrosoft } = useProviders();
  const [busy, setBusy] = useState(null);

  const handle = async (provider, connectFn) => {
    setBusy(provider);
    try {
      const token = await connectFn();
      await loadAccount(provider === 'google' ? 'gmail' : 'outlook', token);
      Alert.alert('Connected 🎉', 'Your mail is loading, sorted by priority.');
      goBack();
    } catch (e) {
      if (e.message === 'not-configured') {
        Alert.alert(
          'One quick setup step',
          `To use a real ${provider} account you first need to paste a free Client ID into src/auth/authConfig.js. See README.md → "Turn on real logins". Until then, enjoy demo mode!`
        );
      } else if (e.message !== 'cancelled') {
        Alert.alert('Sign-in failed', e.message || 'Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  const iCloudInfo = () =>
    Alert.alert(
      'iCloud is a little different',
      "Apple doesn't offer a 'Sign in for email' button like Google and Microsoft do. iCloud Mail only connects through IMAP with an app-specific password, which needs a small server component to work in a phone app. See README.md → 'Why iCloud is different' for the simple path to enable it."
    );

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable style={styles.backRow} onPress={goBack} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
        <Text style={styles.backText}>Inbox</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>Connect your email</Text>
        <Text style={styles.sub}>
          Brisk only ever asks to READ your mail so it can sort it. Your password is
          never seen by this app.
        </Text>

        <ProviderCard
          icon="logo-google"
          color="#EA4335"
          title="Gmail"
          subtitle={accounts.gmail ? 'Connected' : isConfigured.google() ? 'Tap to sign in' : 'Needs 1-time setup'}
          connected={accounts.gmail}
          busy={busy === 'google'}
          onPress={() => handle('google', connectGoogle)}
          onDisconnect={() => disconnect('gmail')}
        />

        <ProviderCard
          icon="mail"
          color="#0A84FF"
          title="Outlook"
          subtitle={accounts.outlook ? 'Connected' : isConfigured.microsoft() ? 'Tap to sign in' : 'Needs 1-time setup'}
          connected={accounts.outlook}
          busy={busy === 'outlook'}
          onPress={() => handle('outlook', connectMicrosoft)}
          onDisconnect={() => disconnect('outlook')}
        />

        <ProviderCard
          icon="cloud"
          color="#8E8E93"
          title="iCloud"
          subtitle="Read how to enable"
          connected={false}
          busy={false}
          onPress={iCloudInfo}
        />

        <View style={styles.demoNote}>
          <Ionicons name="sparkles" size={16} color={colors.brand} />
          <Text style={styles.demoText}>
            {accounts.demo
              ? "You're in demo mode with sample emails — perfect for trying the swipe deck."
              : 'Demo emails are hidden now that a real account is connected.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProviderCard({ icon, color, title, subtitle, connected, busy, onPress, onDisconnect }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.cardPressed }]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={{ flex: 1, marginLeft: space.md }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={[styles.cardSub, connected && { color: colors.fyi }]}>{subtitle}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.brand} />
      ) : connected ? (
        <Pressable hitSlop={10} onPress={onDisconnect}>
          <Text style={styles.disconnect}>Disconnect</Text>
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  backRow: { flexDirection: 'row', alignItems: 'center', padding: space.md },
  backText: { color: colors.text, fontSize: font.title, fontWeight: '600' },
  body: { padding: space.lg },
  h1: { color: colors.text, fontSize: font.h1, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: font.body, lineHeight: 22, marginTop: space.sm, marginBottom: space.lg },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: radius.md, padding: space.md, marginBottom: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  iconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontSize: font.title, fontWeight: '700' },
  cardSub: { color: colors.textDim, fontSize: font.small, marginTop: 2 },
  disconnect: { color: colors.urgent, fontWeight: '700', fontSize: font.small },
  demoNote: {
    flexDirection: 'row', gap: 10, backgroundColor: colors.brandSoft,
    padding: space.md, borderRadius: radius.md, marginTop: space.sm, alignItems: 'flex-start',
  },
  demoText: { color: colors.textDim, fontSize: font.small, flex: 1, lineHeight: 20 },
});
