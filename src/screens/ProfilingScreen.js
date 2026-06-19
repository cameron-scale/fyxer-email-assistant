// ProfilingScreen.js
// Full-screen "profiling your inbox" loader shown on first launch / right after
// an account is connected. It is entirely self-contained and self-animating:
// a single ~6 second timer drives a circular progress ring, a live category
// breakdown, a pulsing activity row with rotating status copy, and an estimated
// time-remaining readout. When it finishes, the ring turns green, a checkmark
// springs in, and a frosted "Inbox ready" card slides up before auto-navigating
// to the inbox.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';

// ── Tunables ────────────────────────────────────────────────────────────────
const DURATION = 6000;       // total profiling time (ms)
const CARD_DELAY = 2400;     // auto-navigate after the completion card shows (ms)
const RING_SIZE = 220;       // outer ring diameter
const STROKE = 14;           // ring stroke width
const R = (RING_SIZE - STROKE) / 2;       // ring radius
const CIRC = 2 * Math.PI * R;             // ring circumference

// The seven categories the profiler sorts mail into, with their accent colors
// and a plausible proportion of the inbox. Proportions need not sum to exactly 1
// — they're normalized when we distribute the total.
const CATEGORIES = [
  { key: 'respond', label: 'Respond / Action', color: '#60A5FA', weight: 0.18 },
  { key: 'urgent', label: 'Urgent', color: '#EF4444', weight: 0.07 },
  { key: 'meeting', label: 'Meeting', color: '#818CF8', weight: 0.11 },
  { key: 'newsletter', label: 'Newsletter', color: '#2DD4BF', weight: 0.24 },
  { key: 'notification', label: 'Notification', color: '#34D399', weight: 0.19 },
  { key: 'fyi', label: 'FYI / Be Aware', color: '#6B7280', weight: 0.13 },
  { key: 'client', label: 'Client', color: '#1D4ED8', weight: 0.08 },
];

const STATUS_MESSAGES = [
  'Reading sender patterns',
  'Scoring urgency',
  'Detecting newsletters',
  'Finding your VIPs',
  'Grouping conversations',
  'Applying your preferences',
];

const DONE_GREEN = '#34D399';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Spread `total` across the categories by weight, making sure the integer parts
// add back up to exactly `total` (remainder lands on the largest bucket).
function distribute(total) {
  const sumW = CATEGORIES.reduce((s, c) => s + c.weight, 0);
  const raw = CATEGORIES.map((c) => (c.weight / sumW) * total);
  const floors = raw.map((n) => Math.floor(n));
  let used = floors.reduce((s, n) => s + n, 0);
  let rem = total - used;
  // hand out the leftover to the categories with the largest fractional part
  const order = raw
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (rem > 0 && order.length) {
    floors[order[k % order.length].i] += 1;
    rem -= 1;
    k += 1;
  }
  return floors;
}

function fmtTime(sec) {
  if (sec <= 0) return '0s';
  if (sec < 60) return `${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.ceil(sec % 60);
  return `${m}m ${s}s`;
}

export default function ProfilingScreen({ goBack, navigate, params }) {
  const store = useStore();
  // Lock the total to the first real value so a late mailboxTotal update can't
  // reset the animation mid-way (which made it finish early, e.g. "9 / 33,827").
  const [total, setTotal] = useState(() => {
    const t = params && typeof params.total === 'number' ? params.total : store.mailboxTotal;
    return (t && t > 1) ? Math.max(1, Math.round(t)) : 0;
  });
  useEffect(() => {
    if (total) return;
    if (store.mailboxTotal && store.mailboxTotal > 1) setTotal(Math.round(store.mailboxTotal));
    else { const to = setTimeout(() => setTotal((cur) => cur || Math.max(1, Math.round(store.mailboxTotal || 1200))), 1400); return () => clearTimeout(to); }
  }, [store.mailboxTotal, total]);

  // Per-category target counts (fixed for the life of this screen).
  const targets = useMemo(() => (total ? distribute(total) : []), [total]);

  // ── Animated values ─────────────────────────────────────────────────────
  const progress = useRef(new Animated.Value(0)).current;   // 0 → 1 ring fill
  const dotPulse = useRef(new Animated.Value(0)).current;    // pulsing blue dot
  const checkScale = useRef(new Animated.Value(0)).current;  // checkmark spring
  const cardY = useRef(new Animated.Value(60)).current;      // card slide-up
  const cardOpacity = useRef(new Animated.Value(0)).current;

  // ── React state mirrored off the timer ──────────────────────────────────
  const [pct, setPct] = useState(0);                  // 0 → 1
  const [profiled, setProfiled] = useState(0);        // count of emails profiled
  const [catCounts, setCatCounts] = useState(() => CATEGORIES.map(() => 0));
  const [activeCat, setActiveCat] = useState(0);      // index into CATEGORIES
  const [statusIdx, setStatusIdx] = useState(0);
  const [remaining, setRemaining] = useState(DURATION / 1000);
  const [done, setDone] = useState(false);

  const startRef = useRef(0);
  const rafActive = useRef(true);
  const navTimer = useRef(null);
  const statusTimer = useRef(null);
  const tickHandle = useRef(null);
  const navigatedRef = useRef(false);

  // Go to the inbox exactly once (button press or auto-timer both route here).
  const finish = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    if (navTimer.current) { clearTimeout(navTimer.current); navTimer.current = null; }
    if (params && typeof params.onDone === 'function') {
      try { params.onDone(); } catch (e) { /* ignore */ }
    }
    if (typeof navigate === 'function') navigate('Inbox');
  };

  // Pulsing dot loop — runs for the whole profiling phase.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dotPulse]);

  // Rotating status copy.
  useEffect(() => {
    statusTimer.current = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length);
    }, DURATION / STATUS_MESSAGES.length);
    return () => { if (statusTimer.current) clearInterval(statusTimer.current); };
  }, []);

  // The main timer: a ~60fps tick that advances progress, the per-category
  // counts, the active category, and the ETA. Drives both the Animated ring
  // (via setValue) and the React-rendered numbers.
  useEffect(() => {
    startRef.current = Date.now();
    rafActive.current = true;

    if (!total) return undefined; // wait until the real mailbox total is known
    const tick = () => {
      if (!rafActive.current) return;
      const elapsed = Date.now() - startRef.current;
      const t = Math.min(1, elapsed / DURATION);
      // ease the fill slightly so it feels organic, not strictly linear
      const eased = 1 - Math.pow(1 - t, 1.6);

      progress.setValue(eased);
      setPct(eased);

      const doneCount = Math.round(eased * total);
      setProfiled(doneCount);

      // distribute the profiled count across categories proportionally to targets
      const nextCounts = targets.map((tg) => Math.round(tg * eased));
      // fix rounding drift so the category counts sum to doneCount
      let sum = nextCounts.reduce((s, n) => s + n, 0);
      let diff = doneCount - sum;
      let idx = 0;
      while (diff !== 0 && nextCounts.length) {
        const j = idx % nextCounts.length;
        if (diff > 0) { nextCounts[j] += 1; diff -= 1; } else if (nextCounts[j] > 0) { nextCounts[j] -= 1; diff += 1; }
        idx += 1;
        if (idx > total + nextCounts.length) break; // safety
      }
      setCatCounts(nextCounts);

      // active category cycles through the list as the ring fills
      setActiveCat(Math.min(CATEGORIES.length - 1, Math.floor(eased * CATEGORIES.length)));

      // ETA from emails-per-second so far
      const elapsedSec = elapsed / 1000;
      const eps = elapsedSec > 0.25 ? doneCount / elapsedSec : 0;
      const rem = eps > 0 ? (total - doneCount) / eps : (DURATION - elapsed) / 1000;
      setRemaining(Math.max(0, rem));

      if (t >= 1) {
        rafActive.current = false;
        completeProfiling();
        return;
      }
      tickHandle.current = setTimeout(tick, 16);
    };
    tickHandle.current = setTimeout(tick, 16);

    return () => {
      rafActive.current = false;
      if (tickHandle.current) clearTimeout(tickHandle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, targets]);

  // Completion: snap everything to 100%, play the checkmark + card animations,
  // and arm the auto-navigate timer.
  const completeProfiling = () => {
    setDone(true);
    setPct(1);
    setProfiled(total);
    setCatCounts(targets.slice());
    setRemaining(0);
    if (statusTimer.current) { clearInterval(statusTimer.current); statusTimer.current = null; }

    Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();

    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(cardY, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    navTimer.current = setTimeout(finish, CARD_DELAY);
  };

  // Cleanup every timer on unmount.
  useEffect(() => () => {
    rafActive.current = false;
    if (tickHandle.current) clearTimeout(tickHandle.current);
    if (statusTimer.current) clearInterval(statusTimer.current);
    if (navTimer.current) clearTimeout(navTimer.current);
  }, []);

  // ── Derived display values ───────────────────────────────────────────────
  const active = CATEGORIES[activeCat] || CATEGORIES[0];
  const ringColor = done ? DONE_GREEN : active.color;
  const haloColor = done ? DONE_GREEN : active.color;
  const pctLabel = Math.round(pct * 100);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRC, 0],
  });

  const dotOpacity = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const dotScale = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] });

  const timeColor = remaining < 5 ? DONE_GREEN : remaining < 15 ? '#FBBF24' : colors.onDarkDim;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        {/* Wordmark + subtitle */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>
            <Text style={styles.wordScale}>Scale</Text>
            <Text style={styles.wordMail}>Mail</Text>
          </Text>
          <Text style={styles.subtitle}>Profiling your inbox</Text>
        </View>

        {/* Ring */}
        <View style={styles.ringWrap}>
          {/* soft glow halo behind the ring — shifts with the active category */}
          <View
            style={[
              styles.halo,
              { shadowColor: haloColor, backgroundColor: haloColor },
            ]}
          />
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            style={{ transform: [{ rotate: '-90deg' }] }}
          >
            {/* track */}
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={R}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={STROKE}
              fill="none"
            />
            {/* progress */}
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={R}
              stroke={ringColor}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={strokeDashoffset}
            />
          </Svg>

          {/* Center label */}
          <View style={styles.ringCenter} pointerEvents="none">
            {done ? (
              <Animated.View style={[styles.ringCheck, { transform: [{ scale: checkScale }] }]}>
                <Ionicons name="checkmark" size={56} color={DONE_GREEN} />
              </Animated.View>
            ) : (
              <>
                <Text style={styles.centerCaption}>Emails profiled</Text>
                <View style={styles.countRow}>
                  <Text style={[styles.countNow, { color: ringColor }]}>{profiled}</Text>
                  <Text style={styles.countSlash}> / </Text>
                  <Text style={styles.countTotal}>{total}</Text>
                </View>
                <Text style={styles.centerPct}>{pctLabel}%</Text>
              </>
            )}
          </View>
        </View>

        {/* Activity row */}
        <View style={styles.activityRow}>
          <View style={styles.activityLeft}>
            <Animated.View
              style={[styles.pulseDot, { opacity: dotOpacity, transform: [{ scale: dotScale }] }]}
            />
            <Text style={styles.statusText} numberOfLines={1}>
              {done ? 'Profiling complete' : STATUS_MESSAGES[statusIdx]}
            </Text>
          </View>
          <Text style={[styles.timeText, { color: timeColor }]}>
            {done ? 'Done' : `${fmtTime(remaining)} left`}
          </Text>
        </View>

        {/* Category legend */}
        <View style={styles.legend}>
          {CATEGORIES.map((c, i) => {
            const count = catCounts[i] || 0;
            const lit = count > 0;
            return (
              <View key={c.key} style={[styles.legendRow, !lit && styles.legendRowDim]}>
                <View style={[styles.legendDot, { backgroundColor: c.color, opacity: lit ? 1 : 0.35 }]} />
                <Text style={[styles.legendLabel, !lit && styles.legendLabelDim]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.legendCount, { color: lit ? c.color : colors.onDarkFaint }]}>
                  {count}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Completion card */}
      {done && (
        <Animated.View style={[styles.overlay, { opacity: cardOpacity }]} pointerEvents="box-none">
          <Animated.View
            style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardY }] }]}
          >
            <Animated.View style={[styles.cardCheck, { transform: [{ scale: checkScale }] }]}>
              <Ionicons name="checkmark" size={36} color="#FFFFFF" />
            </Animated.View>
            <Text style={styles.cardTitle}>Inbox ready</Text>
            <Text style={styles.cardSubtitle}>
              {total.toLocaleString()} emails profiled and organized
            </Text>
            <Pressable
              style={({ pressed }) => [styles.cardButton, pressed && styles.cardButtonPressed]}
              onPress={finish}
            >
              <Text style={styles.cardButtonText}>Go to Inbox</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent', // aurora shows through
  },
  content: {
    flex: 1,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: space.xl,
  },
  wordmark: {
    fontSize: font.h1,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  wordScale: { color: colors.onDark },
  wordMail: { color: colors.blue },
  subtitle: {
    marginTop: space.sm,
    color: colors.onDarkDim,
    fontSize: font.body,
    fontWeight: '500',
  },

  // Ring
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
  halo: {
    position: 'absolute',
    width: RING_SIZE - 30,
    height: RING_SIZE - 30,
    borderRadius: (RING_SIZE - 30) / 2,
    opacity: 0.18,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 40,
    elevation: 12,
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCheck: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCaption: {
    color: colors.onDarkDim,
    fontSize: font.small,
    fontWeight: '600',
    marginBottom: 2,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  countNow: {
    fontSize: 40,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  countSlash: {
    color: colors.onDarkFaint,
    fontSize: font.h2,
    fontWeight: '600',
  },
  countTotal: {
    color: colors.onDarkDim,
    fontSize: font.h2,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  centerPct: {
    marginTop: 2,
    color: colors.onDark,
    fontSize: font.title,
    fontWeight: '700',
  },

  // Activity row
  activityRow: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.blue,
    marginRight: space.sm,
  },
  statusText: {
    color: colors.onDark,
    fontSize: font.body,
    fontWeight: '500',
    flexShrink: 1,
  },
  timeText: {
    fontSize: font.small,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginLeft: space.sm,
  },

  // Legend
  legend: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.onDarkFill,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.onDarkBorder,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  legendRowDim: {
    opacity: 0.85,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: space.md,
  },
  legendLabel: {
    flex: 1,
    color: colors.onDark,
    fontSize: font.small,
    fontWeight: '600',
  },
  legendLabelDim: {
    color: colors.onDarkDim,
    fontWeight: '500',
  },
  legendCount: {
    fontSize: font.small,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'right',
  },

  // Completion card
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 48,
    paddingHorizontal: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(13,17,23,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  cardCheck: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: DONE_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
    shadowColor: DONE_GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 8,
  },
  cardTitle: {
    color: colors.onDark,
    fontSize: font.h2,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: colors.onDarkDim,
    fontSize: font.body,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: space.xl,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: space.xl,
    alignSelf: 'stretch',
  },
  cardButtonPressed: {
    opacity: 0.85,
  },
  cardButtonText: {
    color: '#FFFFFF',
    fontSize: font.title,
    fontWeight: '700',
    marginRight: space.sm,
  },
});
