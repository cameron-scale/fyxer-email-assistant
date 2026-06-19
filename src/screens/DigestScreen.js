// DigestScreen.js — a once-a-day narrative summary of your inbox. A frosted-glass
// AI summary broken into four independently-tappable paragraphs, a "Needs Your
// Attention" list, a stat grid, and a security insight card. Dark / glass styling.

import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';

// ── Accent palette for the inline highlights / category dots ──────────────────
const ACCENT = {
  blue: '#4DA3FF',    // action items
  amber: '#FFB454',   // security warnings
  indigo: '#8E8CFF',  // meetings
  teal: '#46D6B6',    // newsletters
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function greeting(hour) {
  if (hour < 5) return 'Still up? 🌙';
  if (hour < 12) return 'Good morning ☕';
  if (hour < 17) return 'Good afternoon ☀️';
  if (hour < 21) return 'Good evening 🌆';
  return 'Good night 🌙';
}

function prettyDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function prettyTime(d) {
  try { return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch (e) { return ''; }
}

const CAT_DOT = {
  Urgent: colors.urgent,
  Client: ACCENT.blue,
  'Action Needed': ACCENT.blue,
  Meeting: ACCENT.indigo,
  Newsletter: ACCENT.teal,
  FYI: colors.noise,
};

export default function DigestScreen({ goBack, navigate, params }) {
  const { emails, counts, mailboxUnread } = useStore();
  const nav = (screen, p) => { if (typeof navigate === 'function') navigate(screen, p); };

  // Pulsing blue dot on the AI Summary label.
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const now = new Date();

  // ── Derive real numbers / examples from the store, with graceful fallbacks ──
  const inB = (e, b) => e && e.priority && e.priority.bucket === b;
  const inC = (e, c) => e && e.priority && e.priority.category === c;

  const actionEmails = useMemo(
    () => emails.filter((e) => inC(e, 'Action Needed') || inB(e, 'urgent') || inB(e, 'important')),
    [emails],
  );
  const meetingEmails = useMemo(() => emails.filter((e) => inC(e, 'Meeting')), [emails]);
  const newsletterEmails = useMemo(() => emails.filter((e) => inC(e, 'Newsletter')), [emails]);

  // A security alert = an urgent email whose text mentions a sign-in / verification.
  const securityEmail = useMemo(() => {
    const re = /(security|sign[- ]?in|password|verify|verification|suspicious|unusual|2fa|breach|alert|locked)/i;
    return emails.find((e) => {
      const hay = `${(e.priority && e.priority.tldr) || ''} ${(e.priority && e.priority.senderName) || ''} ${e.subject || ''}`;
      return re.test(hay) && (inB(e, 'urgent') || inB(e, 'important'));
    }) || null;
  }, [emails]);

  // Rows for "Needs Your Attention" — top urgent/important, else representative mock.
  const attentionRows = useMemo(() => {
    const real = emails
      .filter((e) => inB(e, 'urgent') || inB(e, 'important'))
      .slice(0, 4)
      .map((e) => ({
        id: e.id,
        category: (e.priority && e.priority.category) || 'Action Needed',
        text: (e.priority && e.priority.tldr) || e.subject || 'Needs your reply',
        sender: (e.priority && e.priority.senderName) || (e.priority && e.priority.senderEmail) || 'Unknown',
        time: prettyTime(e.date),
      }));
    if (real.length) return real;
    return [
      { id: null, category: 'Action Needed', text: 'Approve the Q3 budget before EOD', sender: 'Dana Whitfield', time: '9:12 AM' },
      { id: null, category: 'Urgent', text: 'Contract signature needed to close', sender: 'Legal Team', time: '8:40 AM' },
      { id: null, category: 'Meeting', text: 'Confirm 2pm partner sync', sender: 'Priya Anand', time: 'Yesterday' },
    ];
  }, [emails]);

  // Numbers for the stat grid + paragraph indicators.
  const total = (counts && counts.total) || emails.length || 0;
  const unread = (mailboxUnread != null ? mailboxUnread : null);
  const actionCount = actionEmails.length || (counts ? counts.urgent + counts.important : 0);
  const meetingCount = meetingEmails.length;
  const newsletterCount = newsletterEmails.length || (counts ? counts.noise : 0);

  // The first action / meeting email we'd open from a paragraph tap.
  const firstAction = actionEmails[0];
  const firstMeeting = meetingEmails[0];

  const openAction = () => (firstAction && firstAction.id ? nav('Thread', { id: firstAction.id }) : nav('Inbox', { filter: 'action' }));
  const openSecurity = () => (securityEmail && securityEmail.id ? nav('Thread', { id: securityEmail.id }) : nav('Inbox', { filter: 'urgent' }));
  const openMeetings = () => (firstMeeting && firstMeeting.id ? nav('Thread', { id: firstMeeting.id }) : nav('Inbox', { filter: 'meetings' }));
  const openNewsletters = () => nav('Inbox', { filter: 'newsletter' });

  // Names to weave into the narrative.
  const actionName = (firstAction && firstAction.priority && firstAction.priority.senderName) || 'Dana';
  const securityName = (securityEmail && securityEmail.priority && securityEmail.priority.senderName) || 'Microsoft';
  const meetingName = (firstMeeting && firstMeeting.priority && firstMeeting.priority.senderName) || 'Priya';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.scrim} pointerEvents="none" />

      {/* Top bar */}
      <View style={styles.topbar}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>Digest</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.eyebrowRow}>
          <Ionicons name="sparkles" size={11} color={ACCENT.blue} />
          <Text style={styles.eyebrow}>Your Digest</Text>
        </View>
        <Text style={styles.h1}>{greeting(now.getHours())}</Text>
        <Text style={styles.date}>{prettyDate(now)}</Text>

        {/* AI Summary card */}
        <View style={styles.card}>
          <View style={styles.aiLabelRow}>
            <Animated.View style={[styles.pulseDot, { opacity: pulse }]} />
            <Text style={styles.aiLabel}>AI Summary</Text>
          </View>

          {/* Paragraph 1 — action items */}
          <SummaryParagraph
            count={actionCount}
            onPress={openAction}
          >
            You have <Hi c={ACCENT.blue}>{actionCount} action items</Hi> waiting — the most pressing is a request
            from <Hi c={ACCENT.blue}>{actionName}</Hi> that needs a reply before the day gets away from you. Nothing
            here is on fire, but a few quick responses would clear the deck.
          </SummaryParagraph>

          <View style={styles.divider} />

          {/* Paragraph 2 — security alert */}
          <SummaryParagraph
            count={securityEmail ? 1 : 1}
            onPress={openSecurity}
          >
            Heads up: <Hi c={ACCENT.amber}>{securityName}</Hi> flagged a{' '}
            <Hi c={ACCENT.amber}>security sign-in alert</Hi> on your account. It looks routine, but it is worth a
            ten-second glance to confirm it was you.
          </SummaryParagraph>

          <View style={styles.divider} />

          {/* Paragraph 3 — meeting recaps */}
          <SummaryParagraph
            count={meetingCount || 2}
            onPress={openMeetings}
          >
            On the calendar front, there {meetingCount === 1 ? 'is' : 'are'}{' '}
            <Hi c={ACCENT.indigo}>{meetingCount || 2} meeting{(meetingCount || 2) === 1 ? '' : 's'}</Hi> with notes
            to review — <Hi c={ACCENT.indigo}>{meetingName}</Hi> shared a recap with a couple of follow-ups assigned
            to you.
          </SummaryParagraph>

          <View style={styles.divider} />

          {/* Paragraph 4 — newsletters */}
          <SummaryParagraph
            count={newsletterCount}
            onPress={openNewsletters}
          >
            Everything else is low-stakes: <Hi c={ACCENT.teal}>{newsletterCount} newsletters</Hi> and digests piled
            up overnight. None need a reply — sweep them when you have a quiet minute, or just{' '}
            <Hi c={ACCENT.teal}>archive the lot</Hi>.
          </SummaryParagraph>
        </View>

        {/* Needs Your Attention */}
        <Text style={styles.sectionLabel}>Needs Your Attention</Text>
        <View style={styles.attnList}>
          {attentionRows.map((row, i) => (
            <Pressable
              key={row.id || `attn-${i}`}
              style={({ pressed }) => [styles.attnRow, pressed && styles.rowPressed]}
              onPress={() => (row.id ? nav('Thread', { id: row.id }) : nav('Inbox', { filter: 'action' }))}
            >
              <View style={[styles.catDot, { backgroundColor: CAT_DOT[row.category] || ACCENT.blue }]} />
              <View style={styles.attnMid}>
                <Text style={styles.attnText} numberOfLines={2}>{row.text}</Text>
                <Text style={styles.attnMeta} numberOfLines={1}>
                  {row.sender}{row.time ? `  ·  ${row.time}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onDarkDim} />
            </Pressable>
          ))}
        </View>

        {/* By the Numbers */}
        <Text style={styles.sectionLabel}>By the Numbers</Text>
        <View style={styles.statGrid}>
          <StatCard
            wide
            n={unread != null ? unread : total}
            label="Unread"
            color={ACCENT.blue}
            grad={[ACCENT.blue, '#1E6FD8']}
            onPress={() => nav('Inbox', { filter: 'unread' })}
          />
          <StatCard
            wide
            n={actionCount}
            label="Action Needed"
            color={ACCENT.amber}
            grad={[ACCENT.amber, '#FF8A5C']}
            onPress={() => nav('Inbox', { filter: 'action' })}
          />
          <StatCard
            n={meetingCount}
            label="Meetings"
            color={ACCENT.indigo}
            grad={[ACCENT.indigo, '#5B59E0']}
            onPress={() => nav('Inbox', { filter: 'meetings' })}
          />
          <StatCard
            n={newsletterCount}
            label="Newsletters"
            color={ACCENT.teal}
            grad={[ACCENT.teal, '#2AA88E']}
            onPress={() => nav('Inbox', { filter: 'newsletter' })}
          />
          <StatCard
            n={total}
            label="Total"
            color={colors.onDark}
            grad={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.2)']}
            onPress={() => nav('Inbox', { filter: 'all' })}
          />
        </View>

        {/* Security insight */}
        <Pressable
          style={({ pressed }) => [styles.security, pressed && styles.securityPressed]}
          onPress={openSecurity}
        >
          <View style={styles.shieldWrap}>
            <Ionicons name="shield-checkmark" size={22} color={ACCENT.blue} />
          </View>
          <View style={styles.securityMid}>
            <Text style={styles.securityTitle}>
              {securityEmail ? 'Security alert detected' : 'No security alerts'}
            </Text>
            <Text style={styles.securitySub} numberOfLines={2}>
              {securityEmail
                ? `${securityName} reported an unusual sign-in. Tap to review and confirm it was you.`
                : 'Your accounts look healthy. Tap to review recent sign-in activity.'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.onDarkDim} />
        </Pressable>

        <View style={{ height: space.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Inline highlight wrapper.
function Hi({ c, children }) {
  return <Text style={{ color: c, fontWeight: '600' }}>{children}</Text>;
}

// A tappable narrative paragraph with a count indicator above it.
function SummaryParagraph({ count, onPress, children }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.para, pressed && styles.paraPressed]}
      onPress={onPress}
    >
      <View style={styles.indicatorRow}>
        <View style={styles.indicatorDot} />
        <Text style={styles.indicator}>
          {count} {count === 1 ? 'EMAIL' : 'EMAILS'} →
        </Text>
      </View>
      <Text style={styles.narrative}>{children}</Text>
    </Pressable>
  );
}

// One stat card in the grid.
function StatCard({ n, label, color, grad, onPress, wide }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.stat, wide && styles.statWide, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <Text style={[styles.statN, { color }]}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
      <View style={styles.statBarTrack}>
        <View style={[styles.statBar, { backgroundColor: grad[0] }]} />
        <View style={[styles.statBar, { backgroundColor: grad[1] }]} />
      </View>
    </Pressable>
  );
}

const CARD_BG = 'rgba(255,255,255,0.06)';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,18,0.5)' },

  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm },
  back: { width: 40, height: 32, justifyContent: 'center' },
  topTitle: { color: colors.onDark, fontSize: font.title, fontWeight: '700' },

  body: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: ACCENT.blue },
  h1: { fontSize: font.h1, fontWeight: '800', color: colors.onDark, marginTop: 6 },
  date: { fontSize: font.body, color: colors.onDarkDim, marginTop: 3 },

  // AI Summary card
  card: { backgroundColor: CARD_BG, borderRadius: radius.lg, padding: 18, marginTop: space.lg, borderWidth: 1, borderColor: colors.onDarkBorder },
  aiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT.blue },
  aiLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onDarkDim },

  para: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginHorizontal: -12 },
  paraPressed: { backgroundColor: 'rgba(255,255,255,0.07)' },
  indicatorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  indicatorDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ACCENT.blue, opacity: 0.7 },
  indicator: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: ACCENT.blue, opacity: 0.7 },
  narrative: { fontSize: 15, lineHeight: 23, color: colors.onDark },
  divider: { height: 1, backgroundColor: colors.onDarkBorder, marginVertical: 4 },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.onDarkDim, marginTop: space.xl, marginBottom: space.md },

  // Needs Your Attention
  attnList: { gap: space.sm },
  attnRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.onDarkBorder },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  catDot: { width: 9, height: 9, borderRadius: 5, marginRight: 12 },
  attnMid: { flex: 1, marginRight: 8 },
  attnText: { fontSize: 14, fontWeight: '600', color: colors.onDark, lineHeight: 19 },
  attnMeta: { fontSize: 12, color: colors.onDarkDim, marginTop: 3 },

  // By the Numbers
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md, paddingTop: 16, paddingBottom: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.onDarkBorder, overflow: 'hidden', minWidth: 96, flexGrow: 1, flexBasis: '30%' },
  statWide: { flexBasis: '47%' },
  statN: { fontSize: 30, fontWeight: '800' },
  statL: { fontSize: 12, color: colors.onDarkDim, marginTop: 2 },
  statBarTrack: { flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 12 },
  statBar: { flex: 1, height: 3 },

  // Security insight
  security: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(77,163,255,0.1)', borderRadius: radius.lg, padding: 16, marginTop: space.xl, borderWidth: 1, borderColor: 'rgba(77,163,255,0.25)' },
  securityPressed: { backgroundColor: 'rgba(77,163,255,0.16)' },
  shieldWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(77,163,255,0.16)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  securityMid: { flex: 1, marginRight: 8 },
  securityTitle: { fontSize: 15, fontWeight: '700', color: colors.onDark },
  securitySub: { fontSize: 12.5, color: colors.onDarkDim, marginTop: 3, lineHeight: 17 },
});
