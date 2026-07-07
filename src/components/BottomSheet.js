// BottomSheet.js — a slide-up sheet with a dimmed backdrop and a grab handle,
// matching the ScaleMail compose/profile sheets. Built on the Animated API so it
// works in Expo Go with no extra libraries.
//
// It stays mounted while animating out, then unmounts, so children (like a compose
// form) keep their state until the close animation finishes.

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, StyleSheet, Pressable, View, useWindowDimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, radius } from '../theme';

export default function BottomSheet({ visible, onClose, heightPct = 0.9, children }) {
  const [mounted, setMounted] = useState(visible);
  // Read the live window height (not a module-load constant) so the sheet is sized
  // correctly regardless of when this module first loaded or device rotation.
  const { height: winH } = useWindowDimensions();
  const sheetH = Math.round(winH * heightPct);
  // Start fully below the screen. We reset this to `sheetH` every time we open, so
  // the slide-up always plays even on the very first open.
  const translateY = useRef(new Animated.Value(winH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Reset to the off-screen start position, then animate up on the NEXT frame —
      // after the sheet view has actually mounted. Starting a native-driven
      // animation in the same tick as the mount can be dropped in Expo Go, which
      // left the sheet stuck off-screen (backdrop dimmed but nothing popped up).
      translateY.setValue(sheetH);
      const raf = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }),
          Animated.timing(backdrop, { toValue: 1, duration: 240, useNativeDriver: true }),
        ]).start();
      });
      return () => cancelAnimationFrame(raf);
    }
    if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: sheetH, duration: 240, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
    return undefined;
  }, [visible, sheetH]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { height: sheetH, transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 40, shadowOffset: { width: 0, height: -8 },
  },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: colors.hairline, alignSelf: 'center', marginTop: 10 },
});
