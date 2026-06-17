// DetailScreen.js — read one email, see a TL;DR, and tap a ready-made reply.
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, SafeAreaView, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';
import Avatar from '../components/Avatar';
import PriorityPill from '../components/PriorityPill';
import { suggestReplies } from '../lib/drafts';
import { timeAgo } from '../lib/time';

const TONES = [
  { key: 'professional', label: 'Professional' },
  { key: 'friendly', label: 'Friendly' },
  { key: 'brief', label: 'Brief' },
];

export default function DetailScreen({ params, goBack }) {
  const { emails, archive, snooze, markDone, markRead, prefs, setPrefs, toggleVip } = useStore();
  const email = emails.find((e) => e.id === params.id);

  // Mark as read the first time we open it.
  React.useEffect(() => {
    if (email && !email.read) markRead(email.id);
  }, [email?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drafts re-generate when the email OR your tone/signature changes.
  const drafts = useMemo(
    () => (email ? suggestReplies(email, prefs) : []),
    [email?.id, prefs.tone, prefs.signature] // eslint-disable-line
  );
  const [reply, setReply] = useState('');

  if (!email) {
    return (
      <SafeAreaView style={styles.safe}>
        <Pressable style={styles.backRow} onPress={goBack}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
          <Text style={styles.backText}>Inbox</Text>
        </Pressable>
        <Text style={styles.gone}>This email was moved. 👋</Text>
      </SafeAreaView>
    );
  }

  const p = email.priority;

  const act = (fn, msg) => {
    fn(email.id);
    goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable style={styles.backRow} onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
          <Text style={styles.backText}>Inbox</Text>
        </Pressable>
        <View style={styles.topActions}>
          <Pressable hitSlop={10} onPress={() => toggleVip(p.senderEmail)}>
            <Ionicons
              name={p.isVip ? 'star' : 'star-outline'}
              size={23}
              color={p.isVip ? colors.important : colors.textDim}
            />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => act(snooze)}>
            <Ionicons name="time-outline" size={23} color={colors.snooze} />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => act(archive)}>
            <Ionicons name="archive-outline" size={23} color={colors.archive} />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => act(markDone)}>
            <Ionicons name="checkmark-done" size={23} color={colors.done} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.pillRow}>
          <PriorityPill bucket={p.bucket} />
          <View style={styles.category}>
            <Text style={styles.categoryText}>{p.category}</Text>
          </View>
          {p.isVip && (
            <View style={styles.vipTag}>
              <Ionicons name="star" size={11} color={colors.important} />
              <Text style={styles.vipTagText}>VIP</Text>
            </View>
          )}
        </View>
        <Text style={styles.subject}>{email.subject}</Text>

        <View style={styles.senderRow}>
          <Avatar name={p.senderName} size={46} />
          <View style={{ marginLeft: space.md, flex: 1 }}>
            <Text style={styles.senderName}>{p.senderName}</Text>
            <Text style={styles.senderEmail}>{p.senderEmail}</Text>
          </View>
          <Text style={styles.time}>{timeAgo(email.date)}</Text>
        </View>

        {/* Why it's ranked here */}
        <View style={styles.insight}>
          <View style={styles.insightHead}>
            <Ionicons name="sparkles" size={15} color={colors.brand} />
            <Text style={styles.insightTitle}>Why Brisk ranked this</Text>
          </View>
          {p.reasons.length ? (
            p.reasons.map((r, i) => (
              <Text key={i} style={styles.insightLine}>• {r}</Text>
            ))
          ) : (
            <Text style={styles.insightLine}>• General message</Text>
          )}
        </View>

        {/* TL;DR */}
        <Text style={styles.label}>TL;DR</Text>
        <Text style={styles.tldr}>{p.tldr}</Text>

        {/* Full body */}
        <Text style={styles.label}>Full message</Text>
        <Text style={styles.full}>{email.body}</Text>

        {/* Reply tone — drafts adapt to match how you write */}
        <Text style={styles.label}>Reply tone</Text>
        <View style={styles.chips}>
          {TONES.map((tn) => {
            const active = prefs.tone === tn.key;
            return (
              <Pressable
                key={tn.key}
                onPress={() => setPrefs({ tone: tn.key })}
                style={[styles.toneChip, active && styles.toneChipActive]}
              >
                <Text style={[styles.toneText, active && styles.toneTextActive]}>{tn.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Quick replies */}
        <Text style={styles.label}>Quick replies — tap to use</Text>
        <View style={styles.chips}>
          {drafts.map((d) => (
            <Pressable key={d.label} style={styles.draftChip} onPress={() => setReply(d.text)}>
              <Text style={styles.draftChipText}>{d.label}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.input}
          value={reply}
          onChangeText={setReply}
          multiline
          placeholder="Write or tap a quick reply above…"
          placeholderTextColor={colors.textFaint}
        />
        <View style={styles.sigRow}>
          <Text style={styles.sigLabel}>Sign as</Text>
          <TextInput
            style={styles.sigInput}
            value={prefs.signature}
            onChangeText={(t) => setPrefs({ signature: t })}
            placeholder="Your name"
            placeholderTextColor={colors.textFaint}
          />
        </View>

        <Pressable
          style={styles.sendBtn}
          onPress={() =>
            Alert.alert(
              'Reply ready ✍️',
              'Sending is turned off in this preview build (read-only access). Your draft is ready to copy into your mail app.'
            )
          }
        >
          <Ionicons name="send" size={16} color="#fff" />
          <Text style={styles.sendText}>Send reply</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: colors.text, fontSize: font.title, fontWeight: '600' },
  topActions: { flexDirection: 'row', gap: 20, paddingRight: space.sm },
  body: { padding: space.lg, paddingBottom: 60 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  category: {
    backgroundColor: colors.bgElevated, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  categoryText: { color: colors.textDim, fontSize: font.tiny, fontWeight: '700' },
  vipTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.importantSoft, borderRadius: radius.pill,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  vipTagText: { color: colors.important, fontSize: font.tiny, fontWeight: '800' },
  toneChip: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14,
  },
  toneChipActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  toneText: { color: colors.textDim, fontWeight: '700', fontSize: font.small },
  toneTextActive: { color: colors.brand },
  sigRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.md,
  },
  sigLabel: { color: colors.textFaint, fontSize: font.small, fontWeight: '700' },
  sigInput: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, color: colors.text,
    paddingHorizontal: space.md, paddingVertical: 10, fontSize: font.body,
  },
  subject: { color: colors.text, fontSize: font.h2, fontWeight: '800', marginTop: space.md, marginBottom: space.md },
  senderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
  senderName: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  senderEmail: { color: colors.textFaint, fontSize: font.small, marginTop: 1 },
  time: { color: colors.textFaint, fontSize: font.small },
  insight: {
    backgroundColor: colors.brandSoft, borderRadius: radius.md,
    padding: space.md, marginBottom: space.lg,
  },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  insightTitle: { color: colors.brand, fontWeight: '800', fontSize: font.small },
  insightLine: { color: colors.textDim, fontSize: font.small, lineHeight: 20 },
  label: {
    color: colors.textFaint, fontSize: font.tiny, fontWeight: '800',
    letterSpacing: 1, textTransform: 'uppercase', marginTop: space.lg, marginBottom: space.sm,
  },
  tldr: { color: colors.text, fontSize: font.body, lineHeight: 22 },
  full: { color: colors.textDim, fontSize: font.body, lineHeight: 23 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  draftChip: {
    backgroundColor: colors.card, borderColor: colors.brand, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 15,
  },
  draftChipText: { color: colors.brand, fontWeight: '700', fontSize: font.small },
  input: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, color: colors.text, fontSize: font.body,
    padding: space.md, minHeight: 130, marginTop: space.md, textAlignVertical: 'top',
  },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 14, marginTop: space.md,
  },
  sendText: { color: '#fff', fontWeight: '800', fontSize: font.title },
  gone: { color: colors.textDim, textAlign: 'center', marginTop: 80, fontSize: font.body },
});
