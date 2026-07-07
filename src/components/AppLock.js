// AppLock.js — Face ID / Touch ID / passcode gate over the whole app.
// When enabled (Settings → Security), the app locks on every cold launch and
// whenever it returns from the background after a short grace period, so a
// phone left on a desk never shows privileged mail. Uses the device's own
// authentication (biometrics with passcode fallback) — we never see or store
// the user's secret.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors } from '../theme';
import { useStore } from '../store';

// Re-lock if the app was in the background longer than this.
const RELOCK_AFTER_MS = 60 * 1000;

export default function AppLock() {
  const { prefs } = useStore();
  const enabled = prefs?.appLock === true;
  const [locked, setLocked] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const backgroundedAt = useRef(null);
  const lockedRef = useRef(locked);
  useEffect(() => { lockedRef.current = locked; }, [locked]);

  const unlock = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Scale Mail',
        cancelLabel: 'Cancel',
        // Passcode fallback stays on so a wet thumb or hat+glasses never
        // locks the owner out of their own mail.
        disableDeviceFallback: false,
      });
      if (res.success) setLocked(false);
      else setFailed(true);
    } catch (e) {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  // Lock the moment the setting turns on; drop the lock if it's turned off.
  useEffect(() => { setLocked(enabled); }, [enabled]);

  // Auto-prompt as soon as we're locked (no extra tap on launch).
  useEffect(() => {
    if (enabled && locked) unlock();
  }, [enabled, locked, unlock]);

  // Re-lock after the app sits in the background past the grace period.
  useEffect(() => {
    if (!enabled) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      else if (state === 'active' && backgroundedAt.current) {
        if (!lockedRef.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled]);

  if (!enabled || !locked) return null;

  return (
    <View style={styles.cover}>
      <View style={styles.center}>
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={30} color="#fff" />
        </View>
        <View style={styles.logoRow}>
          <Text style={styles.logoScale}>Scale</Text>
          <Text style={styles.logoMail}>Mail</Text>
        </View>
        <Text style={styles.sub}>Your mail is locked</Text>
        <Pressable style={styles.unlockBtn} onPress={unlock} disabled={busy}>
          <Ionicons name="finger-print" size={18} color="#fff" />
          <Text style={styles.unlockText}>{failed ? 'Try again' : 'Unlock'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', zIndex: 9999, elevation: 9999,
  },
  center: { alignItems: 'center', gap: 6 },
  lockBadge: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(0,113,227,0.25)',
    borderWidth: 1, borderColor: 'rgba(120,170,255,0.35)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoScale: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -1.1 },
  logoMail: { fontSize: 30, fontWeight: '800', color: colors.blue, letterSpacing: -1.1 },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 14, marginTop: 4 },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26,
    backgroundColor: colors.blue, borderRadius: 24, paddingVertical: 13, paddingHorizontal: 32,
    shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  unlockText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
