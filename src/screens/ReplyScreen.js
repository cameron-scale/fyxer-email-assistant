// ReplyScreen.js — a full-screen, formal email reply composer (not a chat bubble).
// Opened from an email's detail view. Shows the recipient, a "Re:" subject, the
// tone selector + one-tap drafts, a large body area with your signature, and the
// quoted original underneath — like a real mail client.

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, useWindowDimensions, InputAccessoryView, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// iOS floating bar above the keyboard so there's always a way to dismiss it.
const KB_ID = 'replyComposerBar';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';
import { suggestReplies } from '../lib/drafts';
import { aiDraft, sendReply, saveDraft, isBackendConfigured } from '../lib/backend';
import { composeText, composeHtml } from '../lib/signature';
import { timeAgo } from '../lib/time';
import ComposeAssistant from '../components/ComposeAssistant';

const TONES = [
  { key: 'professional', label: 'Professional' },
  { key: 'friendly', label: 'Friendly' },
  { key: 'brief', label: 'Brief' },
];

function firstName(name = '') {
  const n = name.trim().split(/\s+/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'there';
}

export default function ReplyScreen({ params, goBack }) {
  const prefill = params?.prefill;
  const { emails, searchEmails, folderEmails, findEmail, prefs, setPrefs, accounts, outlookRefresh, mailAccounts } = useStore();
  const email = findEmail(params.id);
  const p = email?.priority;
  const backendReady = isBackendConfigured(prefs.serverUrl);
  // Resolve the reply's account/token/provider the same way send() does below, so
  // a Gmail- or iCloud-only user can still reply — not just Outlook accounts.
  const replyAcct = (mailAccounts || []).find((a) => a.id === email?.accountId);
  const replyToken = replyAcct?.refreshToken || outlookRefresh;
  const replyProvider = replyAcct?.type || (email?.account === 'gmail' ? 'google' : 'outlook');
  const canSend = backendReady && (
    (!!replyAcct && !!replyAcct.refreshToken) ||
    (accounts.outlook && email?.account === 'outlook') // legacy Outlook-only fallback
  );

  const drafts = useMemo(
    () => (email ? suggestReplies(email, prefs) : []),
    [email?.id, prefs.tone, prefs.signature] // eslint-disable-line
  );

  // Start from a tapped smart-reply if provided, else a polite greeting scaffold.
  const [body, setBody] = useState(
    email ? (prefill ? `Hi ${firstName(p.senderName)},\n\n${prefill}\n\n` : `Hi ${firstName(p.senderName)},\n\n`) : ''
  );
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  // To + Subject are editable (you can change the recipient or rewrite the subject).
  const [toEmail, setToEmail] = useState(email ? p.senderEmail : '');
  const [subject, setSubject] = useState(
    email ? (/^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`) : ''
  );
  const [quoteExpanded, setQuoteExpanded] = useState(false);
  const { height: winH } = useWindowDimensions();
  // A tall, comfortable writing area that scrolls INTERNALLY. This is what keeps
  // the caret in view while typing: an auto-growing field can't track the cursor,
  // so long replies used to scroll off-screen / hide behind the suggestions box.
  const composeH = Math.max(240, Math.round(winH * 0.42));

  const writeWithAi = async () => {
    setAiBusy(true);
    try {
      const { text } = await aiDraft(prefs.serverUrl, {
        subject: email.subject, body: email.body,
        senderName: p.senderName, tone: prefs.tone, signature: prefs.signature,
      });
      if (text) setBody(text);
    } catch (e) {
      Alert.alert('Could not draft', e.message || 'Check your server URL in Settings.');
    } finally {
      setAiBusy(false);
    }
  };

  if (!email) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.gone}>This message was moved. 👋</Text>
        <Pressable style={styles.send} onPress={goBack}><Text style={styles.sendText}>Back</Text></Pressable>
      </SafeAreaView>
    );
  }

  const saveToDrafts = async () => {
    if (!canSend) {
      Alert.alert('Connect an email account first', 'Saving to Drafts needs an email account connected.');
      return;
    }
    // The draft-save backend only writes to the Outlook Drafts folder — never save
    // a Gmail/iCloud draft with the wrong token; those users send directly for now.
    if (replyProvider !== 'outlook') {
      Alert.alert('Send instead', 'Saving to Drafts is only available for Outlook right now — send your reply directly for now.');
      return;
    }
    setSavingDraft(true);
    try {
      await saveDraft(prefs.serverUrl, {
        refreshToken: replyToken,
        toEmail,
        subject,
        html: composeHtml(body, prefs.sig),
      });
      Alert.alert('Saved to Drafts ✓', 'You can finish it later from the Drafts tab.');
      goBack();
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingDraft(false);
    }
  };

  const send = async () => {
    if (!canSend) {
      Alert.alert(
        'Connect an email account to send',
        'Live sending works once your email account is connected via the backend. Your reply is composed and ready to copy in the meantime.'
      );
      return;
    }
    setSending(true);
    try {
      await sendReply(prefs.serverUrl, {
        refreshToken: replyToken,
        provider: replyProvider,
        toEmail,
        subject,
        body: composeText(body, prefs.sig),
        html: composeHtml(body, prefs.sig),
        inReplyToId: email.id,
      });
      Alert.alert('Sent ✓', `Your reply to ${firstName(p.senderName)} is on its way.`);
      goBack();
    } catch (e) {
      Alert.alert('Send failed', e.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title}>Reply</Text>
        <Pressable onPress={send} style={styles.sendBtn} disabled={sending}>
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={14} color="#fff" />
              <Text style={styles.sendBtnText}>Send</Text>
            </>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'android' ? 'height' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="always"
        >
          {/* Recipient + subject — both editable */}
          <View style={styles.field}>
            <Text style={styles.label}>To</Text>
            <TextInput
              style={styles.fieldInput} value={toEmail} onChangeText={setToEmail}
              placeholder="name@email.com" placeholderTextColor={colors.ink4}
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
              inputAccessoryViewID={Platform.OS === 'ios' ? KB_ID : undefined}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Subject</Text>
            <TextInput
              style={styles.fieldInput} value={subject} onChangeText={setSubject}
              placeholder="Subject" placeholderTextColor={colors.ink4}
              inputAccessoryViewID={Platform.OS === 'ios' ? KB_ID : undefined}
            />
          </View>

          {/* Tone + one-tap drafts */}
          <Text style={styles.helper}>Tone</Text>
          <View style={styles.chips}>
            {TONES.map((t) => {
              const active = prefs.tone === t.key;
              return (
                <Pressable key={t.key} onPress={() => setPrefs({ tone: t.key })}
                  style={[styles.toneChip, active && styles.toneChipActive]}>
                  <Text style={[styles.toneText, active && styles.toneTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.helper}>Start from a draft</Text>
          <View style={styles.chips}>
            {backendReady && (
              <Pressable onPress={writeWithAi} style={styles.aiChip} disabled={aiBusy}>
                {aiBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={13} color="#fff" />
                    <Text style={styles.aiChipText}>Write with AI</Text>
                  </>
                )}
              </Pressable>
            )}
            {drafts.map((d) => (
              <Pressable key={d.label} onPress={() => setBody(d.text)} style={styles.draftChip}>
                <Text style={styles.draftChipText}>{d.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Formal body — a fixed-height field that scrolls internally so the
              caret always stays visible (never hidden behind the box below). */}
          <TextInput
            style={[styles.bodyInput, { height: composeH }]}
            value={body}
            onChangeText={setBody}
            multiline
            scrollEnabled
            textAlignVertical="top"
            placeholder="Write your reply…"
            placeholderTextColor={colors.ink4}
            autoFocus
            inputAccessoryViewID={Platform.OS === 'ios' ? KB_ID : undefined}
          />

          {/* AI writing suggestions */}
          {backendReady && (
            <ComposeAssistant
              serverUrl={prefs.serverUrl}
              getBody={() => body}
              onApplyBody={setBody}
              context={`Reply to "${email.subject}" from ${p.senderName}`}
            />
          )}

          {/* Save to drafts */}
          <Pressable style={styles.draftBtn} onPress={saveToDrafts} disabled={savingDraft}>
            {savingDraft ? <ActivityIndicator size="small" color={colors.blue} /> : (
              <>
                <Ionicons name="document-text-outline" size={16} color={colors.blue} />
                <Text style={styles.draftBtnText}>Save to drafts</Text>
              </>
            )}
          </Pressable>

          {/* Quoted original */}
          <View style={styles.quoteWrap}>
            <Text style={styles.quoteHead}>
              On {timeAgo(email.date)}, {p.senderName} wrote:
            </Text>
            <Text style={styles.quoteBody} numberOfLines={quoteExpanded ? undefined : 10}>
              {String(email.body || '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()}
            </Text>
            {String(email.body || '').length > 400 && (
              <Pressable onPress={() => setQuoteExpanded((v) => !v)} hitSlop={6}>
                <Text style={styles.quoteToggle}>{quoteExpanded ? 'Show less' : 'Show full message'}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  cancel: { color: colors.ink3, fontSize: 16, fontWeight: '500' },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.blue, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16,
    shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  body: { padding: 20, paddingBottom: 140 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink4, minWidth: 56 },
  value: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '500' },
  fieldInput: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '500', padding: 0 },
  muted: { color: colors.ink3, fontWeight: '400' },
  helper: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
    color: colors.ink4, marginTop: 18, marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toneChip: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  toneChipActive: { backgroundColor: colors.blueLight },
  toneText: { color: colors.ink3, fontWeight: '700', fontSize: 12.5 },
  toneTextActive: { color: colors.blue },
  draftChip: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.blue,
    borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14,
  },
  draftChipText: { color: colors.blue, fontWeight: '700', fontSize: 12.5 },
  aiChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 33,
    backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14,
  },
  aiChipText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  bodyInput: {
    fontFamily: 'Georgia', fontSize: 16, lineHeight: 26, color: colors.ink,
    marginTop: 18, minHeight: 220, textAlignVertical: 'top',
  },
  draftBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16,
    backgroundColor: colors.blueLight, borderRadius: 12, paddingVertical: 12,
  },
  draftBtnText: { color: colors.blue, fontWeight: '700', fontSize: 14 },
  quoteWrap: {
    marginTop: 20, paddingTop: 16, paddingLeft: 12,
    borderTopWidth: 1, borderTopColor: colors.hairline,
    borderLeftWidth: 3, borderLeftColor: colors.hairline,
  },
  quoteHead: { fontSize: 12, color: colors.ink4, marginBottom: 8 },
  quoteBody: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: colors.ink3 },
  quoteToggle: { color: colors.blue, fontSize: 13, fontWeight: '700', marginTop: 8 },
  kbBar: {
    backgroundColor: colors.surface2, borderTopWidth: 1, borderTopColor: colors.hairline,
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7,
  },
  kbDone: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 8 },
  kbDoneText: { color: colors.blue, fontSize: 16, fontWeight: '700' },
  gone: { color: colors.ink3, textAlign: 'center', marginTop: 80, fontSize: 15 },
  send: { backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 14, margin: 20, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '800', fontSize: font.title },
});
