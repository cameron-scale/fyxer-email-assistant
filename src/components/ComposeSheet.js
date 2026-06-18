// ComposeSheet.js — the "New Message" composer shown inside a BottomSheet.
// Sending is disabled in this read-only preview, so Send just confirms the draft.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import { useStore } from '../store';
import { sendReply, isBackendConfigured } from '../lib/backend';
import { composeText, composeHtml } from '../lib/signature';

export default function ComposeSheet({ onClose }) {
  const { prefs, accounts, outlookRefresh } = useStore();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const canSend = isBackendConfigured(prefs.serverUrl) && accounts.outlook;

  const send = async () => {
    if (!to.trim()) {
      Alert.alert('Add a recipient', 'Enter who this message is going to first.');
      return;
    }
    if (!canSend) {
      Alert.alert('Connect Outlook to send', 'Connect your Outlook account first, then your messages will actually send.');
      return;
    }
    setSending(true);
    try {
      // Pull a plain email out of "Name <email>" if needed.
      const toEmail = (to.match(/[^\s<>]+@[^\s<>]+/) || [to])[0];
      await sendReply(prefs.serverUrl, {
        refreshToken: outlookRefresh,
        toEmail,
        subject,
        body: composeText(body, prefs.sig),
        html: composeHtml(body, prefs.sig),
      });
      Alert.alert('Sent ✓', 'Your message is on its way.');
      onClose();
    } catch (e) {
      Alert.alert('Send failed', e.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title}>New Message</Text>
        <Pressable onPress={send} style={styles.sendBtn} disabled={sending}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>To</Text>
        <TextInput style={styles.input} value={to} onChangeText={setTo}
          placeholder="Name or email" placeholderTextColor={colors.ink4} autoCapitalize="none" />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Re</Text>
        <TextInput style={styles.input} value={subject} onChangeText={setSubject}
          placeholder="Subject" placeholderTextColor={colors.ink4} />
      </View>

      <ScrollView style={styles.bodyWrap} keyboardShouldPersistTaps="handled">
        <TextInput style={styles.body} value={body} onChangeText={setBody}
          placeholder="Write your message…" placeholderTextColor={colors.ink4} multiline />
        <Text style={styles.sig}>{`\n${prefs.signature || 'Cameron'}`}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  cancel: { color: colors.ink3, fontSize: 16, fontWeight: '500' },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  sendBtn: {
    backgroundColor: colors.blue, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 18,
    shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  sendText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  label: { fontSize: 14, fontWeight: '500', color: colors.ink4, minWidth: 24 },
  input: { flex: 1, fontSize: 15, color: colors.ink },
  bodyWrap: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 26, color: colors.ink2, minHeight: 160, textAlignVertical: 'top' },
  sig: { fontFamily: 'Georgia', fontSize: 15, color: colors.ink3, lineHeight: 24 },
});
