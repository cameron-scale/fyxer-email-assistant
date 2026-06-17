// Avatar.js — a colored circle with the sender's initials. Cheap + fun, no images.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { font } from '../theme';

const PALETTE = ['#6C8CFF', '#FF5C7A', '#46D6B6', '#FFB454', '#9B6CFF', '#33C0DD', '#F58CA7'];

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return PALETTE[h % PALETTE.length];
}

export default function Avatar({ name, size = 44 }) {
  const bg = colorFor(name);
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '800', fontSize: font.body },
});
