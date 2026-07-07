// ComposeSheet.js — the "New Message" composer shown inside a BottomSheet.
// Sending is disabled in this read-only preview, so Send just confirms the draft.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, InputAccessoryView, Keyboard,
} from 'react-native';

// iOS floating bar above the keyboard so it can always be dismissed.
const KB_ID = 'composeSheetBar';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { sendReply, saveDraft, voiceFormat, isBackendConfigured } from '../lib/backend';
import { composeText, composeHtml } from '../lib/signature';
import ComposeAssistant from './ComposeAssistant';

function atHour(d, h) { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; }
function schedulePresets() {
  const now = new Date();
  const tonight = atHour(now, 18); if (tonight <= now) tonight.setDate(tonight.getDate() + 1);
  const tom = atHour(now, 8); tom.setDate(tom.getDate() + 1);
  const mon = atHour(now, 8); mon.setDate(mon.getDate() + ((1 - mon.getDay() + 7) % 7 || 7));
  return [
    { label: 'In 1 hour', ts: now.getTime() + 3600000 },
    { label: 'This evening', ts: tonight.getTime() },
    { label: 'Tomorrow morning', ts: tom.getTime() },
    { label: 'Monday morning', ts: mon.getTime() },
  ];
}
const fmt = (ts) => new Date(ts).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export default function ComposeSheet({ onClose }) {
  const { prefs, accounts, outlookRefresh, mailAccounts, activeAccountId } = useStore();
  // Send from the account you're currently viewing (or the first linked one).
  const sendAcct = (mailAccounts || []).find((a) => a.id === activeAccountId) || (mailAccounts || [])[0];
  const sendToken = sendAcct?.refreshToken || outlookRefresh;
  const sendProvider = sendAcct?.type || 'outlook';
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(180);
  const [polishing, setPolishing] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const canSend = isBackendConfigured(prefs.serverUrl) && (accounts.outlook || accounts.gmail);
  const toEmailOf = () => (to.match(/[^\s<>]+@[^\s<>]+/) || [to])[0];

  const doSend = async (sendAt) => {
    if (!to.trim()) { Alert.alert('Add a recipient', 'Enter who this message is going to first.'); return; }
    if (!canSend) { Alert.alert('Connect an account to send', 'Connect Outlook or Gmail first.'); return; }
    setSending(true);
    try {
      await sendReply(prefs.serverUrl, {
        refreshToken: sendToken, provider: sendProvider, toEmail: toEmailOf(), subject,
        body: composeText(body, prefs.sig), html: composeHtml(body, prefs.sig), sendAt,
      });
      Alert.alert(sendAt ? 'Scheduled ✓' : 'Sent ✓', sendAt ? `It'll send ${fmt(sendAt)}.` : 'Your message is on its way.');
      onClose();
    } catch (e) {
      Alert.alert(sendAt ? 'Schedule failed' : 'Send failed', e.message || 'Please try again.');
    } finally { setSending(false); }
  };

  const polish = async () => {
    if (!body.trim()) { Alert.alert('Dictate or type first', 'Use the keyboard mic 🎤 to dictate, then polish.'); return; }
    setPolishing(true);
    try {
      const { subject: s, body: b } = await voiceFormat(prefs.serverUrl, body);
      if (b) setBody(b);
      if (s && !subject.trim()) setSubject(s);
    } catch (e) { Alert.alert('Could not polish', e.message || 'Try again.'); }
    finally { setPolishing(false); }
  };

  const send = () => doSend(null);

  const saveToDrafts = async () => {
    if (!canSend) {
      Alert.alert('Connect an account first', 'Saving to Drafts needs an account connected.');
      return;
    }
    if (sendProvider === 'google') {
      Alert.alert('Send instead', 'Saving to Gmail Drafts is coming soon — for now, send it or schedule it.');
      return;
    }
    setSavingDraft(true);
    try {
      await saveDraft(prefs.serverUrl, {
        refreshToken: sendToken,
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
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title}>New Message</Text>
        <Pressable onPress={send} onLongPress={() => setScheduleOpen(true)} style={styles.sendBtn} disabled={sending}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : (
            <>
              <Text style={styles.sendText}>Send</Text>
              <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.85)" />
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>To</Text>
        <TextInput style={styles.input} value={to} onChangeText={setTo}
          placeholder="Name or email" placeholderTextColor={colors.ink4} autoCapitalize="none"
          inputAccessoryViewID={Platform.OS === 'ios' ? KB_ID : undefined} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Re</Text>
        <TextInput style={styles.input} value={subject} onChangeText={setSubject}
          placeholder="Subject" placeholderTextColor={colors.ink4}
          inputAccessoryViewID={Platform.OS === 'ios' ? KB_ID : undefined} />
      </View>

      <ScrollView style={styles.bodyWrap} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="always" contentContainerStyle={{ paddingBottom: 120 }}>
        <TextInput
          style={[styles.body, { height: Math.max(180, bodyHeight) }]}
          value={body} onChangeText={setBody}
          placeholder="Write your message… (tip: tap the keyboard 🎤 to dictate)" placeholderTextColor={colors.ink4}
          multiline scrollEnabled={false}
          onContentSizeChange={(e) => setBodyHeight(e.nativeEvent.contentSize.height)}
          inputAccessoryViewID={Platform.OS === 'ios' ? KB_ID : undefined}
        />
        {!!(prefs.signature && prefs.signature.trim()) && (
          <Text style={styles.sig}>{`\n${prefs.signature}`}</Text>
        )}

        {isBackendConfigured(prefs.serverUrl) && prefs.privateMode !== true && (
          <Pressable style={styles.voiceBtn} onPress={polish} disabled={polishing}>
            {polishing ? <ActivityIndicator size="small" color={colors.blue} /> : (
              <>
                <Ionicons name="mic" size={15} color={colors.blue} />
                <Text style={styles.voiceText}>Dictate &amp; polish with AI</Text>
              </>
            )}
          </Pressable>
        )}

        {isBackendConfigured(prefs.serverUrl) && prefs.privateMode !== true && (
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

      {/* Schedule send (long-press Send) */}
      <Modal visible={scheduleOpen} transparent animationType="fade" onRequestClose={() => setScheduleOpen(false)}>
        <Pressable style={styles.schedBackdrop} onPress={() => setScheduleOpen(false)} />
        <View style={styles.schedSheet}>
          <Text style={styles.schedTitle}>Schedule send</Text>
          {schedulePresets().map((o) => (
            <Pressable key={o.label} style={styles.schedRow} onPress={() => { setScheduleOpen(false); doSend(o.ts); }}>
              <Ionicons name="time-outline" size={18} color={colors.ink2} />
              <Text style={styles.schedLabel}>{o.label}</Text>
              <Text style={styles.schedWhen}>{fmt(o.ts)}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.schedCancel} onPress={() => setScheduleOpen(false)}><Text style={styles.schedCancelText}>Cancel</Text></Pressable>
        </View>
      </Modal>

      {/* Floating "Done" bar above the keyboard — the way to hide it. */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={KB_ID}>
          <View style={styles.kbBar}>
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.kbDone} hitSlop={10}>
              <Ionicons name="chevron-down" size={18} color={colors.blue} />
              <Text style={styles.kbDoneText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
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
  voiceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, backgroundColor: colors.blueLight, borderRadius: 12, paddingVertical: 11 },
  voiceText: { color: colors.blue, fontWeight: '700', fontSize: 14 },
  schedBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  schedSheet: { position: 'absolute', left: 20, right: 20, top: '32%', backgroundColor: colors.surface, borderRadius: 18, padding: 16 },
  schedTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 8 },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  schedLabel: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '500' },
  schedWhen: { fontSize: 13, color: colors.ink3 },
  schedCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  schedCancelText: { color: colors.ink3, fontWeight: '600' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
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
  kbBar: {
    backgroundColor: colors.surface2, borderTopWidth: 1, borderTopColor: colors.hairline,
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7,
  },
  kbDone: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 8 },
  kbDoneText: { color: colors.blue, fontSize: 16, fontWeight: '700' },
  bodyWrap: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 26, color: colors.ink2, minHeight: 160, textAlignVertical: 'top' },
  sig: { fontFamily: 'Georgia', fontSize: 15, color: colors.ink3, lineHeight: 24 },
  draftBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16,
    backgroundColor: colors.blueLight, borderRadius: 12, paddingVertical: 12,
  },
  draftBtnText: { color: colors.blue, fontWeight: '700', fontSize: 14 },
});
