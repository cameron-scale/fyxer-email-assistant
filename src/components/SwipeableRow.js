// SwipeableRow.js — wraps an inbox row so you can swipe it away.
// Swipe RIGHT = Snooze, swipe LEFT = Archive. A colored action bleeds in behind
// the card as you drag, so you see the action before you release.
// Uses React Native's built-in Animated + PanResponder (no extra libraries), and
// only claims horizontal drags so vertical list scrolling still works normally.

import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View, Text, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, font } from '../theme';

const { width } = Dimensions.get('window');
const THRESHOLD = width * 0.3;

export default function SwipeableRow({ children, onSwipeRight, onSwipeLeft }) {
  const x = useRef(new Animated.Value(0)).current;

  const springBack = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Only take over for clearly-horizontal drags (so the list can still scroll).
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      // Once we've claimed the horizontal drag, don't let the list steal it back
      // mid-swipe (that was the jump/glitch).
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        // Light resistance past the threshold so it feels controlled, not loose.
        const d = g.dx;
        x.setValue(Math.abs(d) > THRESHOLD ? (d > 0 ? THRESHOLD + (d - THRESHOLD) * 0.4 : -THRESHOLD + (d + THRESHOLD) * 0.4) : d);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > THRESHOLD) {
          Animated.timing(x, { toValue: width, duration: 180, useNativeDriver: true }).start(() => onSwipeRight && onSwipeRight());
        } else if (g.dx < -THRESHOLD) {
          Animated.timing(x, { toValue: -width, duration: 180, useNativeDriver: true }).start(() => onSwipeLeft && onSwipeLeft());
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: springBack, // snap back cleanly if interrupted
    })
  ).current;

  const snoozeOpacity = x.interpolate({
    inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp',
  });
  const archiveOpacity = x.interpolate({
    inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp',
  });

  return (
    <View style={styles.wrap}>
      {/* Colored actions revealed as you drag */}
      <Animated.View style={[styles.bg, styles.bgSnooze, { opacity: snoozeOpacity }]}>
        <Ionicons name="time" size={22} color="#fff" />
        <Text style={styles.label}>Snooze</Text>
      </Animated.View>
      <Animated.View style={[styles.bg, styles.bgArchive, { opacity: archiveOpacity }]}>
        <Text style={styles.label}>Archive</Text>
        <Ionicons name="archive" size={22} color="#fff" />
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX: x }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  bg: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    borderRadius: radius.lg, paddingHorizontal: space.lg,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  bgSnooze: { backgroundColor: colors.snooze, justifyContent: 'flex-start' },
  bgArchive: { backgroundColor: colors.archive, justifyContent: 'flex-end' },
  label: { color: '#fff', fontWeight: '800', fontSize: font.body },
});
