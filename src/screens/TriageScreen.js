// TriageScreen.js — the "zip through your inbox" swipe deck.
// Swipe RIGHT to mark done, LEFT to archive, UP to snooze 4h. Tap to open.
// Built with React Native's built-in Animated + PanResponder so it's fast and
// needs no extra libraries.

import React, { useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Animated, PanResponder, Dimensions, Pressable, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';
import Avatar from '../components/Avatar';
import PriorityPill from '../components/PriorityPill';

const { width } = Dimensions.get('window');
const SWIPE = width * 0.28;

export default function TriageScreen({ navigate, goBack }) {
  const { emails, archive, markRead, snooze } = useStore();
  // Freeze the deck order when we enter so cards don't reshuffle as we act.
  const deck = useMemo(() => emails, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(0);

  const pan = useRef(new Animated.ValueXY()).current;
  const current = deck[index];

  const finish = (direction) => {
    if (!current) return;
    // Right = just mark as read (keeps it in the inbox). Left = archive, Up = snooze.
    if (direction === 'left') archive(current.id);
    else if (direction === 'up') snooze(current.id, 4);
    markRead(current.id);
    pan.setValue({ x: 0, y: 0 });
    setIndex((i) => i + 1);
  };

  const fling = (direction) => {
    const to =
      direction === 'right'
        ? { x: width * 1.4, y: 0 }
        : direction === 'left'
        ? { x: -width * 1.4, y: 0 }
        : { x: 0, y: -width * 1.4 };
    Animated.timing(pan, { toValue: to, duration: 200, useNativeDriver: true }).start(() =>
      finish(direction)
    );
  };

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE) fling('right');
        else if (g.dx < -SWIPE) fling('left');
        else if (g.dy < -SWIPE) fling('up');
        else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
      },
    })
  ).current;

  const rotate = pan.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const doneOpacity = pan.x.interpolate({ inputRange: [0, SWIPE], outputRange: [0, 1] });
  const archiveOpacity = pan.x.interpolate({ inputRange: [-SWIPE, 0], outputRange: [1, 0] });
  const snoozeOpacity = pan.y.interpolate({ inputRange: [-SWIPE, 0], outputRange: [1, 0] });

  const done = index >= deck.length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={styles.bar}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.barTitle}>Zip through</Text>
        <Text style={styles.progress}>
          {Math.min(index + (done ? 0 : 1), deck.length)}/{deck.length}
        </Text>
      </View>

      <View style={styles.stage}>
        {done ? (
          <View style={styles.doneWrap}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={styles.doneTitle}>Deck cleared!</Text>
            <Text style={styles.doneSub}>You triaged {deck.length} emails. Nice and fast.</Text>
            <Pressable style={styles.backBtn} onPress={goBack}>
              <Text style={styles.backBtnText}>Back to inbox</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Peek of the next card behind */}
            {deck[index + 1] && (
              <View style={[styles.card, styles.cardBehind]}>
                <Text style={styles.peekSubject} numberOfLines={1}>
                  {deck[index + 1].subject}
                </Text>
              </View>
            )}

            {/* Active card */}
            <Animated.View
              {...responder.panHandlers}
              style={[
                styles.card,
                { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] },
              ]}
            >
              <Animated.View style={[styles.stamp, styles.stampDone, { opacity: doneOpacity }]}>
                <Text style={[styles.stampText, { color: colors.done }]}>READ</Text>
              </Animated.View>
              <Animated.View style={[styles.stamp, styles.stampArchive, { opacity: archiveOpacity }]}>
                <Text style={[styles.stampText, { color: colors.archive }]}>ARCHIVE</Text>
              </Animated.View>
              <Animated.View style={[styles.stampSnooze, { opacity: snoozeOpacity }]}>
                <Text style={[styles.stampText, { color: colors.snooze }]}>SNOOZE 4h</Text>
              </Animated.View>

              <Pressable onPress={() => navigate('Detail', { id: current.id })}>
                <View style={styles.cardHead}>
                  <Avatar name={current.priority.senderName} size={52} />
                  <View style={{ marginLeft: space.md, flex: 1 }}>
                    <Text style={styles.cardSender} numberOfLines={1}>
                      {current.priority.senderName}
                    </Text>
                    <Text style={styles.cardEmail} numberOfLines={1}>
                      {current.priority.senderEmail}
                    </Text>
                  </View>
                </View>
                <View style={styles.pillRow}>
                  <PriorityPill bucket={current.priority.bucket} />
                  <View style={styles.cat}>
                    <Text style={styles.catText}>{current.priority.category}</Text>
                  </View>
                </View>
                <Text style={styles.cardSubject}>{current.subject}</Text>
                <Text style={styles.cardBody}>{current.priority.tldr}</Text>
                <View style={styles.why}>
                  <Ionicons name="sparkles" size={14} color={colors.brand} />
                  <Text style={styles.whyText}>{current.priority.reason}</Text>
                </View>
                <Text style={styles.tapHint}>Tap card to read & reply →</Text>
              </Pressable>
            </Animated.View>
          </>
        )}
      </View>

      {/* Action buttons (for people who prefer tapping to swiping) */}
      {!done && (
        <View style={styles.actions}>
          <ActionButton icon="archive-outline" color={colors.archive} label="Archive" onPress={() => fling('left')} />
          <ActionButton icon="time-outline" color={colors.snooze} label="Snooze" onPress={() => fling('up')} big />
          <ActionButton icon="mail-open-outline" color={colors.done} label="Mark read" onPress={() => fling('right')} />
        </View>
      )}
    </SafeAreaView>
  );
}

function ActionButton({ icon, color, label, onPress, big }) {
  return (
    <Pressable style={styles.actionWrap} onPress={onPress}>
      <View
        style={[
          styles.actionBtn,
          { borderColor: color, backgroundColor: `${color}22` },
          big && styles.actionBig,
        ]}
      >
        <Ionicons name={icon} size={big ? 30 : 24} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  barTitle: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  progress: { color: colors.textDim, fontSize: font.small, fontWeight: '700' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  card: {
    width: width - space.lg * 2,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    position: 'absolute',
  },
  cardBehind: { transform: [{ scale: 0.94 }, { translateY: 26 }], opacity: 0.5 },
  peekSubject: { color: colors.textFaint, fontSize: font.body, fontWeight: '700' },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  cardSender: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  cardEmail: { color: colors.textFaint, fontSize: font.small, marginTop: 2 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cat: {
    backgroundColor: colors.bgElevated, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  catText: { color: colors.textDim, fontSize: font.tiny, fontWeight: '700' },
  cardSubject: { color: colors.text, fontSize: font.h2, fontWeight: '800', marginTop: space.md },
  cardBody: { color: colors.textDim, fontSize: font.body, lineHeight: 22, marginTop: space.sm },
  why: { flexDirection: 'row', alignItems: 'center', marginTop: space.md, gap: 6 },
  whyText: { color: colors.brand, fontSize: font.small, fontWeight: '700' },
  tapHint: { color: colors.textFaint, fontSize: font.small, marginTop: space.lg },
  stamp: {
    position: 'absolute', top: 24, borderWidth: 3, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, zIndex: 5,
  },
  stampDone: { right: 24, borderColor: colors.done, transform: [{ rotate: '14deg' }] },
  stampArchive: { left: 24, borderColor: colors.archive, transform: [{ rotate: '-14deg' }] },
  stampSnooze: {
    position: 'absolute', top: 24, alignSelf: 'center', borderWidth: 3, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, borderColor: colors.snooze, zIndex: 5,
  },
  stampText: { fontSize: font.title, fontWeight: '900', letterSpacing: 1 },
  actions: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 28, paddingBottom: space.xl, paddingTop: space.md,
  },
  actionWrap: { alignItems: 'center', gap: 6 },
  actionBtn: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBig: { width: 70, height: 70, borderRadius: 35 },
  actionLabel: { color: colors.textDim, fontSize: font.tiny, fontWeight: '700' },
  doneWrap: { alignItems: 'center' },
  doneEmoji: { fontSize: 64 },
  doneTitle: { color: colors.text, fontSize: font.h1, fontWeight: '800', marginTop: 12 },
  doneSub: { color: colors.textDim, fontSize: font.body, marginTop: 8, textAlign: 'center' },
  backBtn: {
    marginTop: space.xl, backgroundColor: colors.brand,
    paddingVertical: 14, paddingHorizontal: 28, borderRadius: radius.md,
  },
  backBtnText: { color: '#fff', fontWeight: '800', fontSize: font.title },
});
