// SignatureScreen.js — a no-code email signature builder with live preview.
// Fill in fields, upload a headshot/logo (or paste a URL), pick from six very
// different templates, choose an accent — and see exactly how it'll look. Saved
// to prefs.sig and used whenever you reply or send.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, radius } from '../theme';
import { useStore } from '../store';
import { uploadSignatureImage } from '../lib/backend';
import {
  EMPTY_SIG, ACCENTS, TEMPLATES, hasSignature, templateKey, photoSource, initials,
  SCALEMAIL_FOOTER_TEXT,
} from '../lib/signature';

// Keep uploaded photos small so the email stays light and sends fast.
const MAX_DIM = 512;          // px — plenty sharp for a signature
const MAX_BYTES = 280 * 1024; // ~280 KB ceiling on the embedded image

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

// A round photo, or a tinted monogram fallback, used across the previews.
function Avatar({ sig, size = 52, onAccent }) {
  const src = photoSource(sig);
  if (src) return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  const bg = onAccent ? 'rgba(255,255,255,0.2)' : (sig.accent || colors.blue);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{initials(sig.name)}</Text>
    </View>
  );
}

// Native rendering that mirrors each HTML template, so the preview is honest.
function Preview({ sig }) {
  if (!hasSignature(sig)) {
    return <Text style={styles.previewEmpty}>Fill in your details to see a live preview ✍️</Text>;
  }
  const accent = sig.accent || colors.blue;
  const role = [sig.title, sig.company].filter(Boolean).join(', ');
  const contacts = [sig.phone, sig.email, (sig.website || '').replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean);
  const src = photoSource(sig);
  const t = templateKey(sig);

  const Contacts = ({ color }) =>
    contacts.length ? <Text style={[styles.pvContacts, { color: color || accent }]}>{contacts.join('  ·  ')}</Text> : null;
  const Tagline = () => (sig.tagline ? <Text style={styles.pvTagline}>{sig.tagline}</Text> : null);

  if (t === 'minimal') {
    return (
      <View style={[styles.pvMinimal, { borderTopColor: accent }]}>
        <Text>
          <Text style={styles.pvName}>{sig.name}</Text>
          {!!role && <Text style={styles.pvRoleInline}> — {role}</Text>}
        </Text>
        <Contacts />
      </View>
    );
  }

  if (t === 'modern') {
    return (
      <View style={styles.pvRow}>
        <View style={[styles.pvBar, { backgroundColor: accent }]} />
        <View style={{ flex: 1 }}>
          {!!src && <View style={{ marginBottom: 8 }}><Avatar sig={sig} size={56} /></View>}
          <Text style={styles.pvNameLg}>{sig.name}</Text>
          {!!role && <Text style={styles.pvRole}>{role}</Text>}
          <Tagline />
          <Contacts />
        </View>
      </View>
    );
  }

  if (t === 'executive') {
    return (
      <View style={styles.pvExecWrap}>
        <View style={[styles.pvExecPanel, { backgroundColor: accent }]}>
          <Avatar sig={sig} size={60} onAccent />
        </View>
        <View style={styles.pvExecBody}>
          <Text style={styles.pvNameLg}>{sig.name}</Text>
          {!!sig.title && <Text style={[styles.pvExecTitle, { color: accent }]}>{sig.title.toUpperCase()}</Text>}
          {!!sig.company && <Text style={styles.pvRole}>{sig.company}</Text>}
          <Tagline />
          <Contacts />
        </View>
      </View>
    );
  }

  if (t === 'bold') {
    return (
      <View style={styles.pvBoldWrap}>
        <View style={[styles.pvBoldBanner, { backgroundColor: accent }]}>
          {!!src && <View style={{ marginRight: 12 }}><Avatar sig={sig} size={48} onAccent /></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.pvBoldName}>{sig.name}</Text>
            {!!role && <Text style={styles.pvBoldRole}>{role}</Text>}
          </View>
        </View>
        <View style={styles.pvBoldBody}>
          <Tagline />
          <Contacts />
        </View>
      </View>
    );
  }

  if (t === 'card') {
    return (
      <View style={styles.pvCardWrap}>
        <View style={[styles.pvCardStrip, { backgroundColor: accent }]} />
        <View style={styles.pvCardBody}>
          <View style={styles.pvRow}>
            {!!src && <View style={{ marginRight: 12 }}><Avatar sig={sig} size={52} /></View>}
            <View style={{ flex: 1 }}>
              <Text style={styles.pvNameLg}>{sig.name}</Text>
              {!!role && <Text style={styles.pvRole}>{role}</Text>}
              <Tagline />
              <Contacts />
            </View>
          </View>
        </View>
      </View>
    );
  }

  // classic
  return (
    <View style={styles.pvRow}>
      {!!src && <View style={{ marginRight: 14 }}><Avatar sig={sig} size={60} /></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.pvNameLg}>{sig.name}</Text>
        {!!role && <Text style={styles.pvRole}>{role}</Text>}
        <View style={[styles.pvRule, { backgroundColor: accent }]} />
        <Tagline />
        <Contacts />
      </View>
    </View>
  );
}

export default function SignatureScreen({ goBack }) {
  const { prefs, setPrefs } = useStore();
  const [sig, setSig] = useState({ ...EMPTY_SIG, name: prefs.signature || '', ...(prefs.sig || {}) });
  const [uploading, setUploading] = useState(false);
  const serverUrl = prefs.serverUrl;

  const set = (patch) => setSig((s) => ({ ...s, ...patch }));

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo access needed', 'Allow photo access to upload a headshot or logo for your signature.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (res.canceled) return;
      setUploading(true);
      // Resize + compress so the embedded image stays small and emails send fast.
      const manip = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: MAX_DIM } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const dataUri = `data:image/jpeg;base64,${manip.base64}`;
      const bytes = Math.ceil((manip.base64?.length || 0) * 0.75);
      if (bytes > MAX_BYTES) {
        Alert.alert('Photo is a bit large', 'Try a tighter crop or a simpler logo so it stays light enough to email.');
        return;
      }
      // Show it instantly from the device, then host it on the server so the
      // emailed <img> works everywhere (Gmail included). If hosting fails we keep
      // the embedded copy as a fallback.
      set({ photoUri: dataUri, photoUrl: '' });
      try {
        const { url } = await uploadSignatureImage(serverUrl, dataUri);
        if (url) set({ photoUrl: url, photoUri: '' });
      } catch (e) {
        Alert.alert(
          'Photo saved on your phone',
          "We couldn't reach the server to host it, so it'll be embedded in the email instead (this may not show in Gmail). You can re-upload later to host it.",
        );
      }
    } catch (e) {
      Alert.alert('Could not add photo', e.message || 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    setPrefs({ sig, signature: sig.name || prefs.signature });
    goBack();
  };

  const src = photoSource(sig);

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
          <View style={styles.previewCard}>
            <Preview sig={sig} />
            <View style={styles.previewFooterWrap}>
              <Text style={styles.previewFooter}>
                Sent using <Text style={styles.fScale}>Scale</Text><Text style={styles.fMail}>Mail</Text>, The Best Email Software in Existence
              </Text>
            </View>
          </View>
          <Text style={styles.footerNote}>
            Every email you send signs off with the Scale Mail mark above — automatically.
          </Text>

          {/* Template */}
          <Text style={styles.section}>Template</Text>
          <View style={styles.templateGrid}>
            {TEMPLATES.map((tpl) => {
              const active = templateKey(sig) === tpl.key;
              return (
                <Pressable key={tpl.key} onPress={() => set({ layout: tpl.key })}
                  style={[styles.tplCard, active && styles.tplCardActive]}>
                  <Text style={[styles.tplName, active && styles.tplNameActive]}>{tpl.label}</Text>
                  <Text style={[styles.tplBlurb, active && styles.tplBlurbActive]}>{tpl.blurb}</Text>
                </Pressable>
              );
            })}
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

          {/* Photo / logo */}
          <Text style={styles.section}>Photo or logo</Text>
          <View style={styles.photoRow}>
            <View style={styles.photoPreviewBox}>
              {src ? <Image source={{ uri: src }} style={styles.photoThumb} /> : <Ionicons name="image-outline" size={24} color={colors.ink4} />}
            </View>
            <View style={{ flex: 1 }}>
              <Pressable style={styles.uploadBtn} onPress={pickPhoto} disabled={uploading}>
                {uploading ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                    <Text style={styles.uploadText}>{src ? 'Replace photo' : 'Upload from phone'}</Text>
                  </>
                )}
              </Pressable>
              {!!src && (
                <Pressable onPress={() => set({ photoUri: '', photoUrl: '' })} hitSlop={8}>
                  <Text style={styles.removePhoto}>Remove photo</Text>
                </Pressable>
              )}
            </View>
          </View>
          <Text style={styles.hint}>Square images look best. Resized to {MAX_DIM}px so emails stay light.</Text>
          <Field label="…or paste an image URL" value={sig.photoUrl}
            onChangeText={(t) => set({ photoUrl: t, photoUri: '' })}
            placeholder="https://…/logo.png" keyboardType="url" autoCapitalize="none" />

          {/* Fields */}
          <Text style={styles.section}>Details</Text>
          <Field label="Full name" value={sig.name} onChangeText={(t) => set({ name: t })} placeholder="Cameron Gallup" autoCapitalize="words" />
          <Field label="Title" value={sig.title} onChangeText={(t) => set({ title: t })} placeholder="President & Founder" autoCapitalize="words" />
          <Field label="Company" value={sig.company} onChangeText={(t) => set({ company: t })} placeholder="ScaleMBS" autoCapitalize="words" />
          <Field label="Tagline (optional)" value={sig.tagline} onChangeText={(t) => set({ tagline: t })} placeholder="Helping businesses scale" autoCapitalize="sentences" />
          <Field label="Phone" value={sig.phone} onChangeText={(t) => set({ phone: t })} placeholder="+1 (555) 123-4567" keyboardType="phone-pad" />
          <Field label="Email" value={sig.email} onChangeText={(t) => set({ email: t })} placeholder="cameron@scalembs.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Website" value={sig.website} onChangeText={(t) => set({ website: t })} placeholder="scalembs.com" keyboardType="url" autoCapitalize="none" />

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
    color: colors.ink4, marginTop: 22, marginBottom: 8,
  },
  previewCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.hairline,
    padding: 16, minHeight: 90, justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  previewEmpty: { color: colors.ink4, fontSize: 14, textAlign: 'center' },
  previewFooterWrap: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f3', paddingTop: 10 },
  previewFooter: { fontSize: 11, color: '#9aa0a6', lineHeight: 15 },
  fScale: { color: '#0B2447', fontWeight: '800' },
  fMail: { color: '#0071E3', fontWeight: '800' },
  footerNote: { fontSize: 12, color: colors.ink4, marginTop: 8, lineHeight: 17 },

  // preview pieces
  pvRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pvName: { fontSize: 14, fontWeight: '700', color: '#111' },
  pvNameLg: { fontSize: 16, fontWeight: '700', color: '#111' },
  pvRole: { fontSize: 13, color: '#555', marginTop: 1 },
  pvRoleInline: { fontSize: 13, color: '#999' },
  pvTagline: { fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 4 },
  pvContacts: { fontSize: 13, marginTop: 6, fontWeight: '500' },
  pvMinimal: { borderTopWidth: 2, paddingTop: 8, alignSelf: 'flex-start' },
  pvBar: { width: 4, borderRadius: 3, alignSelf: 'stretch', marginRight: 14 },
  pvRule: { height: 2, width: 44, borderRadius: 1, marginVertical: 8 },
  pvExecWrap: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  pvExecPanel: { padding: 16, alignItems: 'center', justifyContent: 'center' },
  pvExecBody: { backgroundColor: '#f6f8fb', padding: 16, flexShrink: 1 },
  pvExecTitle: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', marginTop: 4 },
  pvBoldWrap: { borderRadius: 10, overflow: 'hidden', alignSelf: 'stretch' },
  pvBoldBanner: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  pvBoldName: { fontSize: 19, fontWeight: '800', color: '#fff' },
  pvBoldRole: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  pvBoldBody: { padding: 14, borderWidth: 1, borderTopWidth: 0, borderColor: '#ececf1', borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  pvCardWrap: { borderWidth: 1, borderColor: '#e8e8ee', borderRadius: 12, overflow: 'hidden', alignSelf: 'stretch' },
  pvCardStrip: { height: 6 },
  pvCardBody: { padding: 16 },

  // template picker
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tplCard: {
    width: '47%', flexGrow: 1, backgroundColor: colors.surface2, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'transparent', paddingVertical: 12, paddingHorizontal: 14,
  },
  tplCardActive: { borderColor: colors.blue, backgroundColor: colors.blueLight },
  tplName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  tplNameActive: { color: colors.blue },
  tplBlurb: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  tplBlurbActive: { color: colors.blue },

  swatches: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 2, borderColor: colors.ink },

  // photo
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoPreviewBox: {
    width: 64, height: 64, borderRadius: 14, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  photoThumb: { width: '100%', height: '100%' },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.blue, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
  },
  uploadText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  removePhoto: { color: colors.urgent, fontSize: 13, fontWeight: '600', marginTop: 8, textAlign: 'center' },

  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink,
  },
  hint: { fontSize: 12, color: colors.ink4, marginTop: 8, marginBottom: 4, lineHeight: 17 },
});
