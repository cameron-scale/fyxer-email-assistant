// GradientButton.js — a chunky, friendly gradient button used for primary actions.
import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, font, gradients } from '../theme';

export default function GradientButton({ title, onPress, colors = gradients.brand, style, icon }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
        {icon}
        <Text style={styles.text}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: radius.md,
    gap: 8,
  },
  text: { color: '#fff', fontSize: font.title, fontWeight: '800' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
