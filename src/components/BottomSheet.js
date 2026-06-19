// BottomSheet.js — a slide-up sheet with a dimmed backdrop and a grab handle,
// matching the ScaleMail compose/profile sheets. Built on the Animated API so it
// works in Expo Go with no extra libraries.
//
// It stays mounted while animating out, then unmounts, so children (like a compose
// form) keep their state until the close animation finishes.

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, StyleSheet, Pressable, View, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, radius } from '../theme';

const { height: SCREEN_H } = Dimensions.get('window');

export default function BottomSheet({ visible, onClose, heightPct = 0.9, children }) {
  const [mounted, setMounted] = useState(visible);
  const sheetH = Math.round(SCREEN_H * heightPct);
  const translateY = useRef(new Animated.Value(sheetH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
        Animated.timing(backdrop, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: sheetH, duration: 240, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? 'height' : undefined}
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
