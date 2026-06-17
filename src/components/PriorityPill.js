// PriorityPill.js — the little colored tag that shows an email's priority.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, font } from '../theme';
import { BUCKETS } from '../lib/priority';

export default function PriorityPill({ bucket, small }) {
  const meta = BUCKETS[bucket] || BUCKETS.fyi;
  const color = colors[meta.colorKey];
  const soft = colors[`${meta.colorKey}Soft`];
  return (
    <View style={[styles.pill, { backgroundColor: soft }, small && styles.small]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }, small && styles.labelSmall]}>
        {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  small: { paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  label: { fontSize: font.small, fontWeight: '700' },
  labelSmall: { fontSize: font.tiny },
});
