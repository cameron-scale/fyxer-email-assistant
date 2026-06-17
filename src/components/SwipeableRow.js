// SwipeableRow.js — wraps an inbox row so you can swipe it away.
// Swipe RIGHT = Done, swipe LEFT = Archive. Matches the triage deck's directions.
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

  const responder = useRef(
    PanResponder.create({
      // Only take over for clearly-horizontal drags (so the FlatList can still scroll).
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => x.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dx > THRESHOLD) {
          Animated.timing(x, { toValue: width, duration: 180, useNativeDriver: true }).start(
            () => onSwipeRight && onSwipeRight()
          );
        } else if (g.dx < -THRESHOLD) {
          Animated.timing(x, { toValue: -width, duration: 180, useNativeDriver: true }).start(
            () => onSwipeLeft && onSwipeLeft()
          );
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const doneOpacity = x.interpolate({
    inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp',
  });
  const archiveOpacity = x.interpolate({
    inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp',
  });

  return (
    <View style={styles.wrap}>
      {/* Colored backgrounds revealed as you drag */}
      <Animated.View style={[styles.bg, styles.bgDone, { opacity: doneOpacity }]}>
        <Ionicons name="checkmark-done" size={22} color="#fff" />
        <Text style={styles.label}>Done</Text>
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
  bgDone: { backgroundColor: colors.done, justifyContent: 'flex-start' },
  bgArchive: { backgroundColor: colors.archive, justifyContent: 'flex-end' },
  label: { color: '#fff', fontWeight: '800', fontSize: font.body },
});
