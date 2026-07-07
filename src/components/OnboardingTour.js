// OnboardingTour.js — a first-launch guided tour. Dims the screen and spotlights
// real UI elements (measured at runtime), with a tooltip card per step. Drives the
// app through a few screens (opens a demo email, opens Zip) via the `onAction`
// callback. RN equivalent of the requested SVG-mask + getBoundingClientRect tour.

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Animated } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { measureTarget } from '../lib/tour';

const { width: SW, height: SH } = Dimensions.get('window');
const PAD = 8;
const RADIUS = 16;
const TOOLTIP_H = 200;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// before/after = navigation actions the App performs; center = no cutout.
const STEPS = [
  { id: 'inbox.wordmark', title: 'Your inbox at a glance', body: 'The unread badge next to ScaleMail updates in real time the moment new mail arrives.', before: 'inbox' },
  { id: 'inbox.avatar', title: 'Profile & Settings', body: 'Tap your avatar for your account list, email signature, VIP senders, the daily Digest, your Calendar, and inbox health.' },
  { id: 'inbox.searchRow', title: 'Search & Ask AI', body: 'Search across all your mail instantly — or flip on AI Ask to pose a question (“what did Stripe send last week?”) and get an answer with the matching emails. The sort button reorders by newest, unread, or sender.' },
  { id: 'inbox.chips', title: 'Smart filter chips', body: 'AI tags every email automatically. Tap Urgent, Action Needed, Meeting, or Client to filter instantly — the red badges show live counts.' },
  { id: 'inbox.firstCard', title: 'Color-coded cards', body: 'The colored band tells you the email type at a glance: red = Urgent, bright blue = Action Needed, indigo = Meeting, deep blue = Client, slate = Newsletter & FYI. You’ll learn the language after one session.' },
  { id: 'inbox.firstTag', title: 'AI category tag', body: 'The pill matches the band color — the same signal confirmed twice, so you’re never guessing what type of email this is.' },
  { id: 'detail.actions', title: 'Quick actions', body: 'Right from the reading view: tap the star to make someone a VIP, snooze to revisit later, or archive to clear it — no extra menus.', before: 'openEmail' },
  { id: 'detail.reply', title: 'Smart replies & next steps', body: 'ScaleMail drafts one-tap replies and a “recommended next step” for emails that need you. Tap Reply to edit and send from your own account.', after: 'closeEmail' },
  { id: 'tabbar', title: 'Your tab bar', body: 'Inbox, Starred, Triage, Sent, and Drafts around a center Compose button. Long-press any tab to rearrange or swap it for Calendar, Digest, and more.', before: 'inbox' },
  { id: 'triage.card', title: 'Triage — swipe through fast', body: 'One card at a time. Swipe right to mark read, left to archive, up to snooze — or tap the card to open and reply. The counter up top tracks your pace.', before: 'openZip' },
  { id: 'triage.card', title: 'Why it matters', body: 'Each card shows the AI’s priority score, the category, a one-line summary, and a short reason it was flagged — so you decide in a glance.' },
  { id: 'triage.actions', title: 'Tap-friendly actions', body: 'Prefer tapping to swiping? Archive, Snooze, or Mark Read with a single tap each. Clear your whole backlog in minutes.', after: 'closeZip' },
  { center: true, title: 'Live aurora background', body: 'The animated background shifts color with your context — blue for the inbox, red for urgent, gold for starred, indigo for meetings.' },
  { id: 'inbox.avatar', title: 'You’re all set — connect your account', body: 'Tap your avatar, then “Connect an account” to add Gmail, Outlook, or iCloud. ScaleMail syncs and categorizes your real mail right away.', before: 'inbox', final: true },
];

function FeaturePill({ icon, label }) {
  return (
    <View style={styles.featPill}>
      <Ionicons name={icon} size={13} color={colors.blue} />
      <Text style={styles.featText}>{label}</Text>
    </View>
  );
}

export default function OnboardingTour({ onAction }) {
  const { tourActive, endTour } = useStore();
  const [phase, setPhase] = useState('welcome'); // 'welcome' | step index
  const [rect, setRect] = useState(null); // measured spotlight, or null (center)
  const fade = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (tourActive) { setPhase('welcome'); Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }).start(); }
  }, [tourActive]); // eslint-disable-line

  const applyStep = useCallback(async (i) => {
    const step = STEPS[i];
    if (step.before) { onAction(step.before); await wait(480); }
    if (step.center) { setRect(null); return; }
    let m = null;
    for (let k = 0; k < 8 && !m; k++) { m = await measureTarget(step.id); if (!m) await wait(140); }
    setRect(m); // null falls back to a centered tooltip
  }, [onAction]);

  useEffect(() => {
    if (typeof phase === 'number') applyStep(phase);
  }, [phase, applyStep]);

  if (!tourActive) return null;

  const finish = () => { endTour(); onAction('inbox'); };

  // ---------- Welcome ----------
  if (phase === 'welcome') {
    return (
      <Animated.View style={[styles.overlay, { opacity: fade }]}>
        <View style={styles.dimFull} />
        <View style={styles.welcomeWrap} pointerEvents="box-none">
          <View style={styles.welcomeCard}>
            <View style={styles.logoBadge}><Text style={styles.logoBadgeText}>S</Text></View>
            <View style={styles.logoRow}>
              <Text style={styles.logoScale}>Scale</Text><Text style={styles.logoMail}>Mail</Text>
            </View>
            <Text style={styles.subtitle}>AI-Powered Inbox</Text>
            <Text style={styles.welcomeDesc}>
              ScaleMail reads, summarizes, and color-codes your mail so you can clear the
              important stuff in minutes. Here’s a 60-second tour.
            </Text>
            <View style={styles.featRow}>
              <FeaturePill icon="sparkles" label="AI Categorization" />
              <FeaturePill icon="alert-circle" label="Urgent Detection" />
              <FeaturePill icon="play-forward" label="Swipe Triage" />
              <FeaturePill icon="color-palette" label="Live Aurora" />
            </View>
            <Pressable style={styles.startBtn} onPress={() => setPhase(0)}>
              <Text style={styles.startText}>Start the tour</Text>
            </Pressable>
            <Pressable onPress={finish} hitSlop={10}>
              <Text style={styles.skipLink}>I’ll explore on my own</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    );
  }

  // ---------- Stepped tour ----------
  const i = phase;
  const step = STEPS[i];
  const hasSpot = !step.center && !!rect;
  const sx = hasSpot ? rect.x - PAD : 0;
  const sy = hasSpot ? rect.y - PAD : 0;
  const sw = hasSpot ? rect.width + PAD * 2 : 0;
  const sh = hasSpot ? rect.height + PAD * 2 : 0;

  // Tooltip below the spotlight, or above if it would overflow; centered if no spot.
  let tooltipTop;
  if (!hasSpot) tooltipTop = SH / 2 - TOOLTIP_H / 2;
  else if (sy + sh + 14 + TOOLTIP_H < SH) tooltipTop = sy + sh + 14;
  else tooltipTop = Math.max(50, sy - TOOLTIP_H - 14);

  const next = async () => {
    if (step.after) { onAction(step.after); await wait(360); }
    if (step.final) { finish(); return; }
    setPhase(i + 1);
  };
  const back = () => { if (i > 0) setPhase(i - 1); };

  return (
    <Animated.View style={[styles.overlay, { opacity: fade }]}>
      <Svg width={SW} height={SH} style={StyleSheet.absoluteFill}>
        <Defs>
          <Mask id="cut">
            <Rect x="0" y="0" width={SW} height={SH} fill="#fff" />
            {hasSpot && <Rect x={sx} y={sy} width={sw} height={sh} rx={RADIUS} ry={RADIUS} fill="#000" />}
          </Mask>
        </Defs>
        <Rect x="0" y="0" width={SW} height={SH} fill="rgba(0,0,0,0.74)" mask="url(#cut)" />
        {hasSpot && <Rect x={sx} y={sy} width={sw} height={sh} rx={RADIUS} ry={RADIUS} fill="none" stroke="#fff" strokeWidth={2} />}
      </Svg>

      {/* Catch all taps so the dimmed area is non-interactive */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} />

      <View style={[styles.tooltip, { top: tooltipTop }]}>
        <View style={styles.dots}>
          {STEPS.map((_, k) => (
            <View key={k} style={k === i ? styles.dotActive : styles.dot} />
          ))}
        </View>
        <Text style={styles.counter}>STEP {i + 1} OF {STEPS.length}</Text>
        <Text style={styles.ttTitle}>{step.title}</Text>
        <Text style={styles.ttBody}>{step.body}</Text>
        <View style={styles.ttButtons}>
          {!step.final ? <Pressable onPress={finish} hitSlop={8}><Text style={styles.skipBtn}>Skip tour</Text></Pressable> : <View />}
          <View style={styles.rightBtns}>
            {i > 0 && <Pressable onPress={back} style={styles.backBtn} hitSlop={8}><Text style={styles.backText}>Back</Text></Pressable>}
            <Pressable onPress={next} style={[styles.nextBtn, step.final && styles.doneBtn]}>
              <Text style={styles.nextText}>{step.final ? 'Done' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 500, elevation: 500 },
  dimFull: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.74)' },

  welcomeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  welcomeCard: {
    width: '100%', maxWidth: 360, backgroundColor: 'rgba(12,16,26,0.97)', borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', padding: 26, alignItems: 'center',
  },
  logoBadge: { width: 52, height: 52, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  logoBadgeText: { color: '#fff', fontSize: 28, fontWeight: '900' },
  logoRow: { flexDirection: 'row' },
  logoScale: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  logoMail: { fontSize: 30, fontWeight: '800', color: colors.blue, letterSpacing: -1 },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  welcomeDesc: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 14 },
  featRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 },
  featPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,113,227,0.16)', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  featText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  startBtn: { backgroundColor: colors.blue, borderRadius: 14, paddingVertical: 14, alignItems: 'center', alignSelf: 'stretch', marginTop: 22 },
  startText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  skipLink: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 16 },

  tooltip: {
    position: 'absolute', left: 16, right: 16, backgroundColor: 'rgba(12,16,26,0.97)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', borderRadius: 22, padding: 18,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { width: 18, height: 6, borderRadius: 3, backgroundColor: colors.blue },
  counter: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  ttTitle: { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 6 },
  ttBody: { color: 'rgba(255,255,255,0.58)', fontSize: 13, lineHeight: 19, marginTop: 6 },
  ttButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  skipBtn: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  rightBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  backText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700' },
  nextBtn: { backgroundColor: colors.blue, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 20 },
  doneBtn: { backgroundColor: '#22A565' },
  nextText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
