// UndoSnackbar.js — a little bar that slides up after you archive/snooze/finish an
// email, giving you a few seconds to tap UNDO. Reads the "recent action" from the
// store, auto-hides after a moment.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, font } from '../theme';
import { useStore } from '../store';

export default function UndoSnackbar() {
  const { recentAction, undoLast, dismissRecent } = useStore();
  const y = useRef(new Animated.Value(120)).current;

  useEffect(() => {
    if (!recentAction) return;
    Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    const timer = setTimeout(() => {
      Animated.timing(y, { toValue: 120, duration: 220, useNativeDriver: true }).start(
        () => dismissRecent()
      );
    }, 3500);
    return () => clearTimeout(timer);
  }, [recentAction]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!recentAction) return null;

  return (
    <Animated.View
      style={[styles.wrap, { transform: [{ translateY: y }] }]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        <Ionicons name="checkmark-circle" size={18} color={colors.fyi} />
        <Text style={styles.text}>{recentAction.label}</Text>
        <Pressable hitSlop={10} onPress={undoLast} style={styles.undoBtn}>
          <Text style={styles.undo}>UNDO</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 100, alignItems: 'center' },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bgElevated, borderRadius: radius.pill,
    paddingVertical: 12, paddingHorizontal: 18,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
  },
  text: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  undoBtn: { marginLeft: space.sm },
  undo: { color: colors.brand, fontSize: font.body, fontWeight: '800', letterSpacing: 0.5 },
});
