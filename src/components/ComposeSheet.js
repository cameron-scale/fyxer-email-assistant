// ComposeSheet.js — the "New Message" composer shown inside a BottomSheet.
// Sending is disabled in this read-only preview, so Send just confirms the draft.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { sendReply, saveDraft, isBackendConfigured } from '../lib/backend';
import { composeText, composeHtml } from '../lib/signature';
import ComposeAssistant from './ComposeAssistant';

export default function ComposeSheet({ onClose }) {
  const { prefs, accounts, outlookRefresh } = useStore();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(180);
  const canSend = isBackendConfigured(prefs.serverUrl) && accounts.outlook;
  const toEmailOf = () => (to.match(/[^\s<>]+@[^\s<>]+/) || [to])[0];

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
      await sendReply(prefs.serverUrl, {
        refreshToken: outlookRefresh,
        toEmail: toEmailOf(),
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

  const saveToDrafts = async () => {
    if (!canSend) {
      Alert.alert('Connect Outlook first', 'Saving to Drafts needs your Outlook account connected.');
      return;
    }
    setSavingDraft(true);
    try {
      await saveDraft(prefs.serverUrl, {
        refreshToken: outlookRefresh,
        toEmail: to.trim() ? toEmailOf() : '',
        subject,
        html: composeHtml(body, prefs.sig),
      });
      Alert.alert('Saved to Drafts ✓', 'Find it in the Drafts tab.');
      onClose();
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
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

      <ScrollView style={styles.bodyWrap} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <TextInput
          style={[styles.body, { height: Math.max(180, bodyHeight) }]}
          value={body} onChangeText={setBody}
          placeholder="Write your message…" placeholderTextColor={colors.ink4}
          multiline scrollEnabled={false}
          onContentSizeChange={(e) => setBodyHeight(e.nativeEvent.contentSize.height)}
        />
        <Text style={styles.sig}>{`\n${prefs.signature || 'Cameron'}`}</Text>

        {isBackendConfigured(prefs.serverUrl) && (
          <ComposeAssistant
            serverUrl={prefs.serverUrl}
            getBody={() => body}
            onApplyBody={setBody}
            context={subject ? `New email: "${subject}"` : 'New professional email'}
          />
        )}

        <Pressable style={styles.draftBtn} onPress={saveToDrafts} disabled={savingDraft}>
          {savingDraft ? <ActivityIndicator size="small" color={colors.blue} /> : (
            <>
              <Ionicons name="document-text-outline" size={16} color={colors.blue} />
              <Text style={styles.draftBtnText}>Save to drafts</Text>
            </>
          )}
        </Pressable>
        <View style={{ height: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  draftBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16,
    backgroundColor: colors.blueLight, borderRadius: 12, paddingVertical: 12,
  },
  draftBtnText: { color: colors.blue, fontWeight: '700', fontSize: 14 },
});
