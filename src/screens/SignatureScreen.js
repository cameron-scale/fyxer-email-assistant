// SignatureScreen.js — a no-code email signature builder with a true-to-email
// live preview. Upload a headshot/logo, add socials, pick from six designer
// templates and an accent — and see exactly how it'll look. Saved to prefs.sig.

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
  EMPTY_SIG, ACCENTS, TEMPLATES, SOCIALS, hasSignature, templateKey, photoSource,
  initials, splitName, contactItems, socialItems,
} from '../lib/signature';

const MAX_DIM = 512;
const MAX_BYTES = 280 * 1024;

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

function Avatar({ sig, size = 60, ring, onAccent }) {
  const src = photoSource(sig);
  const borderWidth = ring ? 3 : 0;
  if (src) {
    return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth, borderColor: ring || 'transparent' }} />;
  }
  const bg = onAccent ? 'rgba(255,255,255,0.2)' : (sig.accent || colors.blue);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth, borderColor: ring || 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{initials(sig.name)}</Text>
    </View>
  );
}

// Two-tone name (first dark, last accent), like the reference templates.
function TwoTone({ name, dark = '#111', accent, size = 19, lastTint }) {
  const { first, last } = splitName(name);
  return (
    <Text style={{ fontSize: size, fontWeight: '800', letterSpacing: 0.3 }}>
      <Text style={{ color: dark }}>{first}</Text>
      {!!last && <Text style={{ color: lastTint || accent }}> {last}</Text>}
    </Text>
  );
}

function Contacts({ sig, color }) {
  return (
    <View style={{ marginTop: 6 }}>
      {contactItems(sig).map((c, i) => (
        <View key={i} style={styles.contactRow}>
          <Text style={styles.contactIcon}>{c.icon}</Text>
          <Text style={[styles.contactText, c.href && { color: color || sig.accent }]} numberOfLines={1}>{c.text}</Text>
        </View>
      ))}
    </View>
  );
}

function Socials({ sig, onDark }) {
  const items = socialItems(sig);
  if (!items.length) return null;
  return (
    <View style={styles.socialRow}>
      {items.map((s) => (
        <View key={s.key} style={[styles.socialBadge, { backgroundColor: onDark ? '#fff' : s.color }]}>
          <Text style={[styles.socialLabel, { color: onDark ? s.color : '#fff' }]}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Preview({ sig }) {
  if (!hasSignature(sig)) {
    return <Text style={styles.previewEmpty}>Fill in your details to see a live preview ✍️</Text>;
  }
  const accent = sig.accent || colors.blue;
  const t = templateKey(sig);

  if (t === 'minimal') {
    return (
      <View style={{ borderTopWidth: 2, borderTopColor: accent, paddingTop: 8, alignSelf: 'flex-start' }}>
        <Text>
          <TwoTone name={sig.name} accent={accent} size={15} />
          {!!sig.title && <Text style={styles.muted}>  ·  {sig.title}{sig.company ? `, ${sig.company}` : ''}</Text>}
        </Text>
        <Contacts sig={sig} color={accent} />
        <Socials sig={sig} />
      </View>
    );
  }

  if (t === 'modern') {
    return (
      <View style={styles.row}>
        <Avatar sig={sig} size={84} ring={accent} />
        <View style={styles.modernDivider} />
        <View style={{ flex: 1 }}>
          <TwoTone name={sig.name} accent={accent} size={19} />
          {!!sig.title && <Text style={[styles.eyebrow, { color: accent }]}>{sig.title.toUpperCase()}</Text>}
          {!!sig.company && <Text style={styles.company}>{sig.company}</Text>}
          {!!sig.tagline && <Text style={styles.tagline}>{sig.tagline}</Text>}
          <Contacts sig={sig} color={accent} />
          <Socials sig={sig} />
        </View>
      </View>
    );
  }

  if (t === 'executive') {
    return (
      <View style={styles.execWrap}>
        <View style={[styles.execPanel, { backgroundColor: accent }]}>
          <Avatar sig={sig} size={66} ring="rgba(255,255,255,0.6)" onAccent />
          {!!sig.company && <Text style={styles.execCompany}>{sig.company}</Text>}
          {!!sig.tagline && <Text style={styles.execTag}>{sig.tagline.toUpperCase()}</Text>}
          <Socials sig={sig} onDark />
        </View>
        <View style={styles.execBody}>
          <TwoTone name={sig.name} dark="#0b2447" accent={accent} size={20} />
          {!!sig.title && <Text style={[styles.eyebrow, { color: accent }]}>{sig.title.toUpperCase()}</Text>}
          <Contacts sig={sig} color={accent} />
        </View>
      </View>
    );
  }

  if (t === 'bold') {
    return (
      <View style={styles.boldWrap}>
        <View style={[styles.boldBanner, { backgroundColor: accent }]}>
          <Avatar sig={sig} size={60} ring="rgba(255,255,255,0.85)" onAccent />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <TwoTone name={sig.name} dark="#fff" accent="#fff" lastTint="rgba(255,255,255,0.75)" size={20} />
            {!!sig.title && <Text style={styles.boldTitle}>{sig.title.toUpperCase()}{sig.company ? ` · ${sig.company}` : ''}</Text>}
            <Socials sig={sig} onDark />
          </View>
        </View>
        <View style={styles.boldBody}>
          {!!sig.tagline && <Text style={styles.tagline}>{sig.tagline}</Text>}
          <Contacts sig={sig} color={accent} />
        </View>
      </View>
    );
  }

  if (t === 'card') {
    return (
      <View style={styles.cardWrap}>
        <View style={[styles.cardStrip, { backgroundColor: accent }]} />
        <View style={styles.cardBody}>
          <View style={styles.row}>
            {photoSource(sig)
              ? <Image source={{ uri: photoSource(sig) }} style={styles.cardPhoto} />
              : <View style={[styles.cardPhoto, { backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 26 }}>{initials(sig.name)}</Text></View>}
            <View style={{ flex: 1, marginLeft: 16 }}>
              <TwoTone name={sig.name} accent={accent} size={18} />
              {!!sig.title && <Text style={[styles.eyebrow, { color: accent }]}>{sig.title.toUpperCase()}</Text>}
              {!!sig.company && <Text style={styles.company}>{sig.company}</Text>}
              <Contacts sig={sig} color={accent} />
              <Socials sig={sig} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  // classic
  return (
    <View style={styles.row}>
      {!!photoSource(sig) && <View style={{ marginRight: 16 }}><Avatar sig={sig} size={64} ring={accent} /></View>}
      <View style={{ flex: 1 }}>
        <TwoTone name={sig.name} accent={accent} size={18} />
        {!!sig.title && <Text style={[styles.eyebrow, { color: accent }]}>{sig.title.toUpperCase()}</Text>}
        {!!sig.company && <Text style={styles.company}>{sig.company}</Text>}
        <View style={[styles.rule, { backgroundColor: accent }]} />
        {!!sig.tagline && <Text style={styles.tagline}>{sig.tagline}</Text>}
        <Contacts sig={sig} color={accent} />
      </View>
      <View style={styles.classicSide}>
        {!!sig.company && <Text style={styles.classicCompany}>{sig.company}</Text>}
        <Socials sig={sig} />
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
        allowsEditing: true, aspect: [1, 1], quality: 1,
      });
      if (res.canceled) return;
      setUploading(true);
      const manip = await ImageManipulator.manipulateAsync(
        res.assets[0].uri, [{ resize: { width: MAX_DIM } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const dataUri = `data:image/jpeg;base64,${manip.base64}`;
      const bytes = Math.ceil((manip.base64?.length || 0) * 0.75);
      if (bytes > MAX_BYTES) {
        Alert.alert('Photo is a bit large', 'Try a tighter crop or a simpler logo so it stays light enough to email.');
        return;
      }
      set({ photoUri: dataUri, photoUrl: '' });
      try {
        const { url } = await uploadSignatureImage(serverUrl, dataUri);
        if (url) set({ photoUrl: url, photoUri: '' });
      } catch (e) {
        Alert.alert('Photo saved on your phone', "We couldn't reach the server to host it, so it'll be embedded in the email instead (may not show in Gmail). You can re-upload later to host it.");
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
          <Text style={styles.section}>Preview</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScroller}>
            <View style={styles.previewCard}>
              <Preview sig={sig} />
              <View style={styles.previewFooterWrap}>
                <Text style={styles.previewFooter}>
                  Sent using <Text style={styles.fScale}>Scale</Text><Text style={styles.fMail}>Mail</Text>, The Best Email Software in Existence
                </Text>
              </View>
            </View>
          </ScrollView>
          <Text style={styles.footerNote}>Every email signs off with the Scale Mail mark above — automatically.</Text>

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

          <Text style={styles.section}>Accent color</Text>
          <View style={styles.swatches}>
            {ACCENTS.map((c) => (
              <Pressable key={c} onPress={() => set({ accent: c })}
                style={[styles.swatch, { backgroundColor: c }, sig.accent === c && styles.swatchActive]}>
                {sig.accent === c && <Ionicons name="checkmark" size={16} color="#fff" />}
              </Pressable>
            ))}
          </View>

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
          <Field label="…or paste an image URL" value={sig.photoUrl}
            onChangeText={(t) => set({ photoUrl: t, photoUri: '' })}
            placeholder="https://…/logo.png" keyboardType="url" autoCapitalize="none" />

          <Text style={styles.section}>Details</Text>
          <Field label="Full name" value={sig.name} onChangeText={(t) => set({ name: t })} placeholder="Cameron Gallup" autoCapitalize="words" />
          <Field label="Title" value={sig.title} onChangeText={(t) => set({ title: t })} placeholder="President & Founder" autoCapitalize="words" />
          <Field label="Company" value={sig.company} onChangeText={(t) => set({ company: t })} placeholder="ScaleMBS" autoCapitalize="words" />
          <Field label="Tagline (optional)" value={sig.tagline} onChangeText={(t) => set({ tagline: t })} placeholder="Helping businesses scale" autoCapitalize="sentences" />
          <Field label="Phone" value={sig.phone} onChangeText={(t) => set({ phone: t })} placeholder="9255551234 or +1 925 555 1234 x4" keyboardType="phone-pad" />
          <Text style={styles.hint}>Auto-formats to (925) 555-1234 in your signature.</Text>
          <Field label="Email" value={sig.email} onChangeText={(t) => set({ email: t })} placeholder="cameron@scalembs.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Website" value={sig.website} onChangeText={(t) => set({ website: t })} placeholder="scalembs.com" keyboardType="url" autoCapitalize="none" />
          <Field label="Location (optional)" value={sig.location} onChangeText={(t) => set({ location: t })} placeholder="San Francisco, CA" autoCapitalize="words" />

          <Text style={styles.section}>Social links (optional)</Text>
          <Text style={styles.hint}>Paste a full URL or just your handle — we'll build the link.</Text>
          {SOCIALS.map((s) => (
            <Field key={s.key} label={s.key.charAt(0).toUpperCase() + s.key.slice(1)}
              value={sig[s.key]} onChangeText={(t) => set({ [s.key]: t })}
              placeholder={s.key === 'twitter' ? '@handle or x.com/…' : `@handle or ${s.key}.com/…`}
              autoCapitalize="none" />
          ))}

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
  previewScroller: { marginHorizontal: -20, paddingHorizontal: 20 },
  previewCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.hairline,
    padding: 18, minWidth: '100%',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  previewEmpty: { color: colors.ink4, fontSize: 14, textAlign: 'center' },
  previewFooterWrap: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f3', paddingTop: 10 },
  previewFooter: { fontSize: 11, color: '#9aa0a6', lineHeight: 15 },
  fScale: { color: '#0B2447', fontWeight: '800' },
  fMail: { color: '#0071E3', fontWeight: '800' },
  footerNote: { fontSize: 12, color: colors.ink4, marginTop: 8, lineHeight: 17 },

  // preview pieces
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  muted: { color: '#888', fontSize: 13 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginTop: 3 },
  company: { fontSize: 13, color: '#555', marginTop: 2 },
  tagline: { fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 6 },
  rule: { height: 2, width: 44, borderRadius: 1, marginVertical: 8 },
  modernDivider: { width: 2, alignSelf: 'stretch', backgroundColor: '#ededf2', marginHorizontal: 18 },
  contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  contactIcon: { width: 22, fontSize: 13 },
  contactText: { fontSize: 13, color: '#555', flexShrink: 1 },
  socialRow: { flexDirection: 'row', marginTop: 10, gap: 6 },
  socialBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  socialLabel: { fontSize: 12, fontWeight: '800' },

  execWrap: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', alignSelf: 'flex-start' },
  execPanel: { padding: 18, alignItems: 'center', justifyContent: 'center', maxWidth: 150 },
  execCompany: { color: '#fff', fontWeight: '800', fontSize: 14, marginTop: 10, letterSpacing: 0.5, textAlign: 'center' },
  execTag: { color: 'rgba(255,255,255,0.8)', fontSize: 10, letterSpacing: 1, marginTop: 2, textAlign: 'center' },
  execBody: { backgroundColor: '#f6f8fb', padding: 18, justifyContent: 'center', flexShrink: 1 },

  boldWrap: { borderRadius: 12, overflow: 'hidden', alignSelf: 'stretch' },
  boldBanner: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  boldTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  boldBody: { padding: 16, borderWidth: 1, borderTopWidth: 0, borderColor: '#ececf1', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },

  cardWrap: { borderWidth: 1, borderColor: '#e8e8ee', borderRadius: 14, overflow: 'hidden', alignSelf: 'stretch' },
  cardStrip: { height: 7 },
  cardBody: { padding: 18 },
  cardPhoto: { width: 70, height: 70, borderRadius: 10 },

  classicSide: { borderLeftWidth: 2, borderLeftColor: '#ededf2', paddingLeft: 16, marginLeft: 8 },
  classicCompany: { fontSize: 14, fontWeight: '800', color: '#111' },

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
  hint: { fontSize: 12, color: colors.ink4, marginTop: -4, marginBottom: 10, lineHeight: 17 },
});
