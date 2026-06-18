// SignatureScreen.js — a no-code email signature builder with live preview.
// Fill in fields, pick a layout + accent color, optionally add a logo/photo URL,
// and see exactly how it'll look. Saved to prefs.sig and used when you reply/send.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { useStore } from '../store';
import { EMPTY_SIG, ACCENTS, LAYOUTS, hasSignature } from '../lib/signature';

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink4}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
    </View>
  );
}

// A native rendering of the signature so the user sees a live preview.
function Preview({ sig }) {
  if (!hasSignature(sig)) {
    return <Text style={styles.previewEmpty}>Fill in your details to see a preview ✍️</Text>;
  }
  const role = [sig.title, sig.company].filter(Boolean).join(', ');
  const contacts = [sig.phone, sig.email, (sig.website || '').replace(/^https?:\/\//, '')].filter(Boolean);
  const accent = sig.accent || colors.blue;
  const photo = sig.photoUrl ? <Image source={{ uri: sig.photoUrl }} style={styles.pvPhoto} /> : null;

  const details = (
    <View style={{ flex: 1 }}>
      <Text style={styles.pvName}>{sig.name}</Text>
      {!!role && <Text style={styles.pvRole}>{role}</Text>}
      {!!sig.tagline && <Text style={styles.pvTagline}>{sig.tagline}</Text>}
      {contacts.length > 0 && (
        <Text style={[styles.pvContacts, { color: accent }]}>{contacts.join('  ·  ')}</Text>
      )}
    </View>
  );

  if (sig.layout === 'Minimal') {
    return <View style={[styles.pvMinimal, { borderTopColor: accent }]}>{details}</View>;
  }
  if (sig.layout === 'Modern') {
    return (
      <View style={styles.pvRow}>
        <View style={[styles.pvBar, { backgroundColor: accent }]} />
        <View style={{ flex: 1 }}>
          {photo && <View style={{ marginBottom: 8 }}>{photo}</View>}
          {details}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.pvRow}>
      {photo && <View style={{ marginRight: 12 }}>{photo}</View>}
      {!photo && <View style={[styles.pvBarTall, { backgroundColor: accent }]} />}
      {details}
    </View>
  );
}

export default function SignatureScreen({ goBack }) {
  const { prefs, setPrefs } = useStore();
  const [sig, setSig] = useState({ ...EMPTY_SIG, name: prefs.signature || '', ...(prefs.sig || {}) });

  const set = (patch) => setSig((s) => ({ ...s, ...patch }));
  const save = () => {
    // Keep prefs.signature (the simple name) in sync for templated replies.
    setPrefs({ sig, signature: sig.name || prefs.signature });
    goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title}>Signature</Text>
        <Pressable onPress={save} style={styles.saveBtn}><Text style={styles.saveText}>Save</Text></Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Live preview */}
          <Text style={styles.section}>Preview</Text>
          <View style={styles.previewCard}><Preview sig={sig} /></View>

          {/* Layout */}
          <Text style={styles.section}>Layout</Text>
          <View style={styles.chips}>
            {LAYOUTS.map((l) => (
              <Pressable key={l} onPress={() => set({ layout: l })}
                style={[styles.chip, sig.layout === l && styles.chipActive]}>
                <Text style={[styles.chipText, sig.layout === l && styles.chipTextActive]}>{l}</Text>
              </Pressable>
            ))}
          </View>

          {/* Accent color */}
          <Text style={styles.section}>Accent color</Text>
          <View style={styles.swatches}>
            {ACCENTS.map((c) => (
              <Pressable key={c} onPress={() => set({ accent: c })}
                style={[styles.swatch, { backgroundColor: c }, sig.accent === c && styles.swatchActive]}>
                {sig.accent === c && <Ionicons name="checkmark" size={16} color="#fff" />}
              </Pressable>
            ))}
          </View>

          {/* Fields */}
          <Text style={styles.section}>Details</Text>
          <Field label="Full name" value={sig.name} onChangeText={(t) => set({ name: t })} placeholder="Cameron Gallup" autoCapitalize="words" />
          <Field label="Title" value={sig.title} onChangeText={(t) => set({ title: t })} placeholder="President & Founder" autoCapitalize="words" />
          <Field label="Company" value={sig.company} onChangeText={(t) => set({ company: t })} placeholder="ScaleMBS" autoCapitalize="words" />
          <Field label="Tagline (optional)" value={sig.tagline} onChangeText={(t) => set({ tagline: t })} placeholder="Helping businesses scale" autoCapitalize="sentences" />
          <Field label="Phone" value={sig.phone} onChangeText={(t) => set({ phone: t })} placeholder="+1 (555) 123-4567" keyboardType="phone-pad" />
          <Field label="Email" value={sig.email} onChangeText={(t) => set({ email: t })} placeholder="cameron@scalembs.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Website" value={sig.website} onChangeText={(t) => set({ website: t })} placeholder="scalembs.com" keyboardType="url" autoCapitalize="none" />
          <Field label="Photo / logo URL (optional)" value={sig.photoUrl} onChangeText={(t) => set({ photoUrl: t })} placeholder="https://…/logo.png" keyboardType="url" autoCapitalize="none" />
          <Text style={styles.hint}>Tip: paste a link to a photo or logo (right‑click an image online → Copy image address).</Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  cancel: { color: colors.ink3, fontSize: 16, fontWeight: '500' },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  saveBtn: { backgroundColor: colors.blue, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 18 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  body: { padding: 20, paddingBottom: 40 },
  section: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
    color: colors.ink4, marginTop: 20, marginBottom: 8,
  },
  previewCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.hairline,
    padding: 16, minHeight: 90, justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  previewEmpty: { color: colors.ink4, fontSize: 14, textAlign: 'center' },
  pvRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pvMinimal: { borderTopWidth: 2, paddingTop: 8 },
  pvBar: { width: 4, borderRadius: 2, alignSelf: 'stretch', marginRight: 12 },
  pvBarTall: { width: 3, borderRadius: 2, alignSelf: 'stretch', marginRight: 10 },
  pvPhoto: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface2 },
  pvName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  pvRole: { fontSize: 13, color: colors.ink2, marginTop: 1 },
  pvTagline: { fontSize: 12, color: colors.ink3, fontStyle: 'italic', marginTop: 2 },
  pvContacts: { fontSize: 13, marginTop: 6, fontWeight: '500' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 16 },
  chipActive: { backgroundColor: colors.blueLight },
  chipText: { color: colors.ink3, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: colors.blue },
  swatches: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 2, borderColor: colors.ink },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink,
  },
  hint: { fontSize: 12, color: colors.ink4, marginTop: 4, lineHeight: 17 },
});
