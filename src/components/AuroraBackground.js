// AuroraBackground.js — an animated aurora that lives behind all UI. Three soft
// radial "orbs" drift and breathe while 40 tiny particles float upward. The color
// palette shifts with the current folder / email (driven by store.palette). This
// is the React-Native equivalent of the requested CSS aurora (no DOM here): orbs
// are react-native-svg radial gradients, motion is the Animated API, and the top
// fade replaces the CSS mask-image.

import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';
import { useStore } from '../store';

const { width, height } = Dimensions.get('window');

// Palettes per folder / email category. o1/o2/o3 = orb colors, p = particle color.
export const PALETTES = {
  default: { o1: '#1D4ED8', o2: '#1E3A8A', o3: '#1E40AF', p: '#93C5FD' },
  clients: { o1: '#1D4ED8', o2: '#1E3A8A', o3: '#2563EB', p: '#93C5FD' },
  work:    { o1: '#6D28D9', o2: '#4C1D95', o3: '#7C3AED', p: '#C4B5FD' },
  finance: { o1: '#059669', o2: '#065F46', o3: '#047857', p: '#6EE7B7' },
  urgent:  { o1: '#B91C1C', o2: '#7F1D1D', o3: '#991B1B', p: '#FCA5A5' },
  starred: { o1: '#B45309', o2: '#78350F', o3: '#D97706', p: '#FCD34D' },
  sent:    { o1: '#334155', o2: '#1E293B', o3: '#475569', p: '#CBD5E1' },
  drafts:  { o1: '#0369A1', o2: '#0C4A6E', o3: '#0284C7', p: '#7DD3FC' },
  meeting: { o1: '#4338CA', o2: '#312E81', o3: '#3730A3', p: '#A5B4FC' },
};

// One drifting orb (Svg radial gradient) animated via translate + scale.
function Orb({ id, size, color, style, keyframes, duration }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [duration, t]);

  const inputRange = keyframes.map((k) => k.at);
  const translateX = t.interpolate({ inputRange, outputRange: keyframes.map((k) => k.x) });
  const translateY = t.interpolate({ inputRange, outputRange: keyframes.map((k) => k.y) });
  const scale = t.interpolate({ inputRange, outputRange: keyframes.map((k) => k.s) });

  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size }, style, { transform: [{ translateX }, { translateY }, { scale }] }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.82} />
            <Stop offset="70%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

// One particle floating upward, seeded to a random phase so they're desynced.
function Particle({ color }) {
  const cfg = useRef({
    left: Math.random() * width,
    size: 2 + Math.random() * 4,
    bottom: Math.random() * height * 0.2,
    dur: (22 + Math.random() * 20) * 1000,
    maxOp: 0.3 + Math.random() * 0.5,
    phase: Math.random(),
  }).current;
  const v = useRef(new Animated.Value(cfg.phase)).current;

  useEffect(() => {
    let loop;
    // Finish the partial first cycle (the random phase), then loop continuously.
    const first = Animated.timing(v, { toValue: 1, duration: cfg.dur * (1 - cfg.phase), easing: Easing.linear, useNativeDriver: true });
    first.start(({ finished }) => {
      if (!finished) return;
      v.setValue(0);
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: cfg.dur, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    });
    return () => { first.stop(); loop && loop.stop(); };
  }, [cfg, v]);

  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -680] });
  const opacity = v.interpolate({ inputRange: [0, 0.08, 0.88, 1], outputRange: [0, cfg.maxOp, cfg.maxOp, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: cfg.left, bottom: cfg.bottom,
        width: cfg.size, height: cfg.size, borderRadius: cfg.size / 2,
        backgroundColor: color, opacity, transform: [{ translateY }],
      }}
    />
  );
}

export default function AuroraBackground() {
  const { palette } = useStore();
  const pal = PALETTES[palette] || PALETTES.default;

  // Gentle crossfade when the palette changes.
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 0.45, duration: 450, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]).start();
  }, [palette, fade]);

  const particles = useMemo(() => Array.from({ length: 40 }), []);

  return (
    <View style={styles.layer} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <Orb
          id="orb1" size={420} color={pal.o1} style={{ top: -80, left: -100 }} duration={18000}
          keyframes={[{ at: 0, x: 0, y: 0, s: 1 }, { at: 0.33, x: 60, y: 40, s: 1.08 }, { at: 0.66, x: -30, y: 60, s: 0.94 }, { at: 1, x: 0, y: 0, s: 1 }]}
        />
        <Orb
          id="orb2" size={360} color={pal.o2} style={{ top: 200, right: -100 }} duration={22000}
          keyframes={[{ at: 0, x: 0, y: 0, s: 1 }, { at: 0.25, x: -50, y: 30, s: 1.1 }, { at: 0.75, x: 40, y: -50, s: 0.92 }, { at: 1, x: 0, y: 0, s: 1 }]}
        />
        <Orb
          id="orb3" size={300} color={pal.o3} style={{ bottom: 80, left: -60 }} duration={26000}
          keyframes={[{ at: 0, x: 0, y: 0, s: 1 }, { at: 0.4, x: 70, y: -40, s: 1.06 }, { at: 0.8, x: -20, y: 50, s: 0.97 }, { at: 1, x: 0, y: 0, s: 1 }]}
        />
        {particles.map((_, i) => <Particle key={i} color={pal.p} />)}
      </Animated.View>
      {/* Top fade — the aurora eases in below the header (≈ CSS mask-image). */}
      <LinearGradient
        colors={[colors.bg, 'rgba(12,15,30,0)']}
        style={styles.topFade}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, overflow: 'hidden', backgroundColor: colors.bg },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 90 },
});
