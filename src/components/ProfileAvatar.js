// ProfileAvatar.js — the user's own avatar (the "CG" badge). Shows their uploaded
// photo when set, otherwise the gradient initials. Used in every header + the
// profile sheet so the photo appears consistently across the app.

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../theme';
import { useStore } from '../store';

export default function ProfileAvatar({ size = 40, initials = 'CG' }) {
  const { prefs } = useStore();
  const uri = prefs?.avatarUri;
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.surface2 }}
      />
    );
  }
  return (
    <LinearGradient colors={gradients.avatar} style={[styles.fill, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.text, { fontSize: size * 0.35 }]}>{initials}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  text: { color: '#fff', fontWeight: '800' },
});
