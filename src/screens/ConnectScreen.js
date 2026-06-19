// ConnectScreen.js — the one place to manage accounts AND every app setting:
// connect/disconnect Gmail / Outlook / iCloud, linked-mailbox list, signature,
// categories, reply tone, VIPs, insights, preferences, AI usage and server URL.
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';
import { hasSignature } from '../lib/signature';
import { isBackendConfigured, microsoftLoginUrl, googleLoginUrl, claimSession, fetchUsage } from '../lib/backend';

const TONES = [
  { key: 'professional', label: 'Professional' },
  { key: 'friendly', label: 'Friendly' },
  { key: 'brief', label: 'Brief' },
];

// Section header + a card "group" of rows, in the dark aurora style.
function Section({ title }) { return <Text style={styles.section}>{title}</Text>; }
function Row({ icon, color, title, value, onPress, right, last }) {
  return (
    <Pressable style={[styles.srow, !last && styles.srowBorder]} onPress={onPress} disabled={!onPress}>
      {icon && <View style={[styles.srowIcon, { backgroundColor: `${color}22` }]}><Ionicons name={icon} size={16} color={color} /></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.srowTitle}>{title}</Text>
        {!!value && <Text style={styles.srowValue} numberOfLines={1}>{value}</Text>}
      </View>
      {right || (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null)}
    </Pressable>
  );
}
function Toggle({ value, onChange }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={[styles.toggle, value && styles.toggleOn]}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

export default function ConnectScreen({ goBack, navigate }) {
  const {
    accounts, prefs, setPrefs, vips, toggleVip, connectOutlook, connectGoogle, disconnect,
    mailAccounts, removeMailAccount, startTour,
  } = useStore();
  const [busy, setBusy] = useState(null);
  const [usage, setUsage] = useState(null);
  const backendReady = isBackendConfigured(prefs.serverUrl);

  useEffect(() => { fetchUsage(prefs.serverUrl).then(setUsage).catch(() => {}); }, [prefs.serverUrl]);
  const used = usage?.total ?? 0;
  const cap = usage?.cap ?? 1000;
  const pct = Math.min(100, Math.round((used / cap) * 100));

  // Run the server-side OAuth handshake (same reliable flow for Google + Microsoft):
  // open the provider's login, get a one-time session id back via the deep link,
  // then claim the real refresh token over HTTPS.
  const runBackendLogin = async (provider) => {
    const nonce = Array.from(Crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    const returnUrl = AuthSession.makeRedirectUri({ scheme: 'brisk', path: 'auth' });
    const loginUrl = provider === 'google'
      ? googleLoginUrl(prefs.serverUrl, returnUrl, nonce)
      : microsoftLoginUrl(prefs.serverUrl, returnUrl, nonce);
    const result = await WebBrowser.openAuthSessionAsync(loginUrl, returnUrl);
    if (result.type !== 'success' || !result.url) return null; // user cancelled
    const params = new URLSearchParams(result.url.split('?')[1] || '');
    const err = params.get('error');
    if (err) throw new Error(err);
    let refresh = params.get('refresh');
    try {
      const claimed = await claimSession(prefs.serverUrl, nonce);
      refresh = claimed.refreshToken;
    } catch (e) {
      const session = params.get('session');
      if (session) { const claimed = await claimSession(prefs.serverUrl, session); refresh = claimed.refreshToken; }
      else if (!refresh) throw e;
    }
    if (!refresh) throw new Error('No token returned');
    return refresh;
  };

  // Gmail via the backend (reliable refresh tokens + Gmail API), like Outlook.
  const handleGmail = async () => {
    if (!backendReady) {
      Alert.alert('Add your server first', 'To connect Gmail, set your backend URL in Settings.', [{ text: 'Open Settings', onPress: () => navigate && navigate('Settings') }, { text: 'OK' }]);
      return;
    }
    setBusy('google');
    try {
      const refresh = await runBackendLogin('google');
      if (!refresh) return;
      await connectGoogle(refresh);
      Alert.alert('Connected 🎉', 'Your Gmail is loading, sorted by priority with AI summaries.');
      goBack();
    } catch (e) {
      Alert.alert('Gmail sign-in failed', e.message || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  // Outlook goes through your backend (real Microsoft 365 login + AI summaries).
  const handleOutlook = async () => {
    if (!backendReady) {
      Alert.alert(
        'Add your server first',
        'To connect Outlook, paste your backend URL in Settings → "Backend server URL". See server/README.md for the 15-minute setup.',
        [{ text: 'Open Settings', onPress: () => navigate && navigate('Settings') }, { text: 'OK' }]
      );
      return;
    }
    setBusy('outlook');
    try {
      const refresh = await runBackendLogin('outlook');
      if (!refresh) return; // user cancelled
      await connectOutlook(refresh);
      Alert.alert('Connected 🎉', 'Your Outlook is loading, sorted by priority with AI summaries.');
      goBack();
    } catch (e) {
      Alert.alert('Outlook sign-in failed', e.message || 'Please try again.');
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

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Accounts & Settings</Text>
        <Text style={styles.sub}>
          Manage your mailboxes and everything ScaleMail does. We only ever ask to READ your
          mail so it can sort it — your password is never seen by this app.
        </Text>

        <Section title="Connect a mailbox" />
        <ProviderCard
          icon="logo-google" color="#EA4335" title="Gmail"
          subtitle={accounts.gmail ? 'Connected · AI summaries on' : backendReady ? 'Tap to sign in' : 'Set server URL below'}
          connected={accounts.gmail} busy={busy === 'google'} onPress={handleGmail} onDisconnect={() => disconnect('gmail')}
        />
        <ProviderCard
          icon="mail" color="#0A84FF" title="Outlook / Microsoft 365"
          subtitle={accounts.outlook ? 'Connected · AI summaries on' : backendReady ? 'Tap to sign in' : 'Set server URL below'}
          connected={accounts.outlook} busy={busy === 'outlook'} onPress={handleOutlook} onDisconnect={() => disconnect('outlook')}
        />
        <ProviderCard
          icon="cloud" color="#8E8E93" title="iCloud" subtitle="Read how to enable"
          connected={false} busy={false} onPress={iCloudInfo}
        />

        {/* Linked mailboxes (multi-account) */}
        {(mailAccounts || []).length > 0 && (
          <>
            <Section title="Linked mailboxes" />
            <View style={styles.group}>
              {mailAccounts.map((a, i) => (
                <Row
                  key={a.id} icon={a.type === 'google' ? 'logo-google' : 'mail'} color={a.type === 'google' ? '#EA4335' : '#0A84FF'}
                  title={a.email || (a.type === 'google' ? 'Gmail account' : 'Outlook account')}
                  value={a.type === 'google' ? 'Gmail' : 'Microsoft 365'}
                  last={i === mailAccounts.length - 1}
                  right={<Pressable hitSlop={10} onPress={() => removeMailAccount(a.id)}><Text style={styles.unlink}>Remove</Text></Pressable>}
                />
              ))}
            </View>
            <Text style={styles.tip}>Tap a provider above and sign in again to add another mailbox.</Text>
          </>
        )}

        {/* Mailbox settings */}
        <Section title="Mailbox" />
        <View style={styles.group}>
          <Row icon="pencil" color="#7C3AED" title={hasSignature(prefs.sig) ? 'Edit signature' : 'Create your signature'} onPress={() => navigate('Signature')} />
          <Row icon="pricetags" color="#4338CA" title="Categories & rules" onPress={() => navigate('Categories')} last />
        </View>

        <Section title="Default reply tone" />
        <View style={styles.chips}>
          {TONES.map((t) => {
            const a = prefs.tone === t.key;
            return (
              <Pressable key={t.key} onPress={() => setPrefs({ tone: t.key })} style={[styles.chip, a && styles.chipActive]}>
                <Text style={[styles.chipText, a && styles.chipTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Section title={`VIP senders (${vips.length})`} />
        {vips.length === 0 ? (
          <View style={styles.group}><Text style={styles.emptyVip}>Star a sender on any email and they always jump to the top.</Text></View>
        ) : (
          <View style={styles.group}>
            {vips.map((email, i) => (
              <Row key={email} icon="star" color="#F5A623" title={email} last={i === vips.length - 1}
                right={<Pressable hitSlop={10} onPress={() => toggleVip(email)}><Ionicons name="close-circle" size={20} color={colors.textFaint} /></Pressable>} />
            ))}
          </View>
        )}

        {/* Insights */}
        <Section title="Insights" />
        <View style={styles.group}>
          <Row icon="calendar" color="#1565C0" title="Calendar" onPress={() => navigate('Calendar')} />
          <Row icon="sunny" color="#B45309" title="Today's digest" onPress={() => navigate('Digest')} />
          <Row icon="pulse" color="#2E7D32" title="Inbox health" onPress={() => navigate('Health')} last />
        </View>

        {/* AI usage */}
        <Section title="AI usage" />
        <View style={styles.usageCard}>
          <Text style={styles.usageLabel}>{used} of {cap} calls this month</Text>
          <View style={styles.bar}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: pct > 90 ? '#FF3B30' : colors.blue }]} /></View>
          <Text style={styles.usageSub}>{usage ? `${usage.summaries} summaries · ${usage.drafts} drafts · ${usage.signatures} signatures` : 'Loading…'}</Text>
        </View>

        {/* Preferences */}
        <Section title="Preferences" />
        <View style={styles.group}>
          <Row icon="chatbubbles" color={colors.blue} title="Group conversations" right={<Toggle value={prefs.groupThreads !== false} onChange={(v) => setPrefs({ groupThreads: v })} />} />
          <Row icon="checkmark-circle" color="#2E7D32" title="Focused inbox" right={<Toggle value={prefs.focusedInbox !== false} onChange={(v) => setPrefs({ focusedInbox: v })} />} />
          <Row icon="notifications" color="#B45309" title="Notifications" right={<Toggle value={prefs.notifications !== false} onChange={(v) => setPrefs({ notifications: v })} />} />
          <Row icon="play-circle" color={colors.blue} title="Replay tutorial" onPress={startTour} last />
        </View>

        {/* Advanced */}
        <Section title="Backend server URL" />
        <View style={styles.group}>
          <TextInput style={styles.input} value={prefs.serverUrl} onChangeText={(t) => setPrefs({ serverUrl: t.trim() })}
            placeholder="https://your-server.onrender.com" placeholderTextColor={colors.textFaint}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </View>

        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={14} color="#34C759" />
          <Text style={styles.privacyText}>ScaleMail sorts everything for you and only ever requests read/send access. Your VIPs, tone and signature stay private on this phone.</Text>
        </View>
        <View style={{ height: 40 }} />
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
  safe: { flex: 1, backgroundColor: 'transparent' },
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
  section: { color: colors.textFaint, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 26, marginBottom: 10 },
  group: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  srow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  srowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  srowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  srowTitle: { color: colors.text, fontSize: 15, fontWeight: '500' },
  srowValue: { color: colors.textDim, fontSize: 12.5, marginTop: 1 },
  unlink: { color: colors.urgent, fontWeight: '700', fontSize: font.small },
  tip: { color: colors.textFaint, fontSize: 12.5, marginTop: 8, lineHeight: 18 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 16 },
  chipActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: colors.brand },
  emptyVip: { padding: 14, color: colors.textDim, fontSize: 13.5, lineHeight: 19 },
  usageCard: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14 },
  usageLabel: { color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  usageSub: { color: colors.textFaint, fontSize: 11.5, marginTop: 6 },
  input: { paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colors.text },
  toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: colors.bgElevated, justifyContent: 'center', paddingHorizontal: 3 },
  toggleOn: { backgroundColor: '#34C759' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  knobOn: { transform: [{ translateX: 20 }] },
  privacy: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.brandSoft, padding: 14, borderRadius: radius.md, marginTop: 26 },
  privacyText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 19 },
});
