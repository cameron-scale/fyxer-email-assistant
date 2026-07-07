// LearnInboxOverlay.js — a full-screen "learn my inbox" overlay. Pages through the
// active account's mailbox (cheap metadata only) showing a live progress ring, then
// makes one AI profiling call to find VIPs. On success it feeds the learned senders
// into prioritization for that one account and shows a frosted "Inbox ready" card.

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Animated, Easing, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';
import { useStore } from '../store';
import { learnScan, learnProfile } from '../lib/backend';

const SAFETY_CAP = 50000; // don't loop forever on a giant mailbox
const RING = 120;         // ring diameter
const STROKE = 9;         // ring stroke width
const R = (RING - STROKE) / 2;            // radius of the stroked circle
const CIRC = 2 * Math.PI * R;             // circumference

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function LearnInboxOverlay() {
  const {
    learnOpen, closeLearn,
    prefs, setPrefs,
    mailAccounts, activeAccountId, outlookRefresh,
    mailboxTotal,
    addKnownImportant,
    vips, toggleVip,
  } = useStore();

  const [phase, setPhase] = useState('idle'); // idle | scanning | done
  const [processed, setProcessed] = useState(0);
  const [result, setResult] = useState(null);

  const runningRef = useRef(false);
  const abortRef = useRef(false);

  // Progress-ring animations.
  const dashAnim = useRef(new Animated.Value(CIRC)).current; // strokeDashoffset (determinate)
  const spinAnim = useRef(new Animated.Value(0)).current;    // rotation loop (indeterminate)
  const spinLoopRef = useRef(null);

  // Done-card animations.
  const checkScale = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(12)).current;
  const subOpacity = useRef(new Animated.Value(0)).current;
  const subY = useRef(new Animated.Value(12)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnY = useRef(new Animated.Value(16)).current;

  const indeterminate = !mailboxTotal || mailboxTotal <= 0;
  const pct = mailboxTotal ? Math.min(1, processed / mailboxTotal) : null;

  // Keep the determinate ring in sync with progress (cannot use the native driver
  // when animating strokeDashoffset on an SVG element).
  useEffect(() => {
    if (phase !== 'scanning' || indeterminate || pct == null) return;
    Animated.timing(dashAnim, {
      toValue: CIRC * (1 - pct),
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [processed, phase, indeterminate, pct, dashAnim]);

  const stopSpin = () => {
    if (spinLoopRef.current) { spinLoopRef.current.stop(); spinLoopRef.current = null; }
  };

  const startSpin = () => {
    spinAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spinLoopRef.current = loop;
    loop.start();
  };

  const resetDoneAnims = () => {
    checkScale.setValue(0);
    titleOpacity.setValue(0); titleY.setValue(12);
    subOpacity.setValue(0); subY.setValue(12);
    btnOpacity.setValue(0); btnY.setValue(16);
  };

  const runDoneAnims = () => {
    resetDoneAnims();
    Animated.sequence([
      Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(subOpacity, { toValue: 1, duration: 260, delay: 40, useNativeDriver: true }),
        Animated.timing(subY, { toValue: 0, duration: 260, delay: 40, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 280, delay: 60, useNativeDriver: true }),
        Animated.timing(btnY, { toValue: 0, duration: 280, delay: 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  };

  const run = async () => {
    const acc = (mailAccounts || []).find((a) => a.id === activeAccountId) || (mailAccounts || [])[0];
    const rt = acc?.refreshToken || outlookRefresh;
    const provider = acc?.type || 'outlook';
    const accId = acc?.id || 'legacy';

    const senders = {}; const subjects = []; let count = 0; let cursor = null;
    try {
      for (let i = 0; i < 1000 && !abortRef.current; i++) {
        const r = await learnScan(prefs?.serverUrl, rt, provider, cursor);
        for (const [k, v] of Object.entries(r?.senders || {})) {
          senders[k] = senders[k] || { name: v?.name, count: 0 };
          senders[k].count += v?.count || 0;
        }
        (r?.subjects || []).forEach((s) => { if (subjects.length < 40) subjects.push(s); });
        count += r?.processed || 0;
        setProcessed(count);
        cursor = r?.cursor;
        if (r?.done || !cursor || count >= SAFETY_CAP) break;
      }
      if (abortRef.current) return;

      const top = Object.entries(senders)
        .map(([email, v]) => ({ email, name: v.name, count: v.count }))
        .filter((s) => s.email.includes('@'))
        .sort((a, b) => b.count - a.count)
        .slice(0, 100);

      const p = await learnProfile(prefs?.serverUrl, top, subjects);
      if (abortRef.current) return;

      const suggestedVips = p?.suggestedVips || [];
      // Feed the learned important senders into prioritization for THIS account only.
      const emails = suggestedVips.map((v) => v?.email).filter((e) => typeof e === 'string' && e.includes('@'));
      if (typeof addKnownImportant === 'function' && emails.length) {
        addKnownImportant(accId, emails);
      }
      setResult({ processed: count, profile: p?.profile, suggestedVips });
      setPhase('done');
      stopSpin();
      runDoneAnims();
    } catch (e) {
      if (abortRef.current) return;
      setResult({ error: e?.message || 'Could not finish learning your inbox', processed: count });
      setPhase('done');
      stopSpin();
      runDoneAnims();
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    if (learnOpen) {
      if (!runningRef.current) {
        runningRef.current = true;
        abortRef.current = false;
        setProcessed(0);
        setResult(null);
        setPhase('scanning');
        dashAnim.setValue(CIRC);
        resetDoneAnims();
        if (!mailboxTotal || mailboxTotal <= 0) startSpin();
        run();
      }
    } else {
      abortRef.current = true;
      runningRef.current = false;
      stopSpin();
      setPhase('idle');
      setProcessed(0);
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnOpen]);

  const cancel = () => {
    abortRef.current = true;
    stopSpin();
    closeLearn();
  };

  const finish = () => {
    setPrefs({ learnedInbox: true });
    closeLearn();
  };

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const countText = `${processed.toLocaleString()} ${
    mailboxTotal
      ? '/ ' + Math.min(mailboxTotal, SAFETY_CAP).toLocaleString() + ' profiled'
      : 'emails profiled…'
  }`;

  const subtitleText = result?.error
    ? 'Learned what I could from your inbox.'
    : `Profiled ${(result?.processed || 0).toLocaleString()} emails${
        result?.suggestedVips?.length ? ` · found ${result.suggestedVips.length} key contacts` : ''
      }.`;

  return (
    <Modal visible={!!learnOpen} transparent animationType="fade" onRequestClose={cancel}>
      <View style={[styles.overlay, phase !== 'done' && styles.overlayScan]}>
        {phase === 'done' ? (
          <View style={styles.card}>
            <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
              <Ionicons name="checkmark" size={30} color="#10B981" />
            </Animated.View>
            <Animated.Text
              style={[styles.cardTitle, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}
            >
              Inbox ready
            </Animated.Text>
            <Animated.Text
              style={[styles.cardSub, { opacity: subOpacity, transform: [{ translateY: subY }] }]}
            >
              {subtitleText}
            </Animated.Text>
            <Animated.View
              style={[styles.btnWrap, { opacity: btnOpacity, transform: [{ translateY: btnY }] }]}
            >
              <Pressable style={styles.primaryBtn} onPress={finish}>
                <Text style={styles.primaryBtnText}>Go to Inbox</Text>
              </Pressable>
            </Animated.View>
          </View>
        ) : (
          <View style={styles.scanCard}>
            <Animated.View
              style={[
                styles.ringWrap,
                { transform: [{ rotate: '-90deg' }, ...(indeterminate ? [{ rotate: spin }] : [])] },
              ]}
            >
              <Svg width={RING} height={RING}>
                <Circle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={R}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={STROKE}
                  fill="none"
                />
                <AnimatedCircle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={R}
                  stroke={colors.blue}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={CIRC}
                  strokeDashoffset={indeterminate ? CIRC * 0.7 : dashAnim}
                />
              </Svg>
            </Animated.View>

            <Text style={styles.countText}>{countText}</Text>
            <Text style={styles.caption}>Studying your inbox…</Text>

            <Pressable style={styles.cancelBtn} onPress={cancel} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  overlayScan: {
    backgroundColor: 'rgba(6,8,15,0.55)', // dim the inbox so the scan card reads clearly
  },
  scanCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(13,17,23,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderRadius: 24,
    paddingVertical: 30,
    paddingHorizontal: 32,
    maxWidth: 300,
    width: '100%',
  },

  // Scanning
  scanWrap: { alignItems: 'center', justifyContent: 'center' },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 26, textAlign: 'center' },
  caption: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, textAlign: 'center' },
  cancelBtn: { marginTop: 22, paddingVertical: 8, paddingHorizontal: 16 },
  cancelText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },

  // Done card
  card: {
    backgroundColor: 'rgba(13,17,23,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 28,
    maxWidth: 300,
    width: '100%',
    alignItems: 'center',
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16,185,129,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  cardTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  cardSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  btnWrap: { width: '100%', marginTop: 24 },
  primaryBtn: {
    backgroundColor: colors.blue,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
