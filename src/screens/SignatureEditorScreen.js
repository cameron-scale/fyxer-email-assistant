// SignatureEditorScreen.js — a Canva-style block editor for the email signature.
// Stack of blocks (text, contact, social, photo, button, divider, spacer); each
// block has rich controls (font, size, color, alignment, bold/italic, margins,
// links, click-to-call). Live WebView preview. No coding required.

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, TextInput, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { colors, radius } from '../theme';
import { useStore } from '../store';
import {
  EMPTY_SIG, ACCENTS, FONTS, BLOCK_TYPES, defaultBlocks, emptyBlock,
  signatureHtml, SCALEMAIL_FOOTER_HTML,
} from '../lib/signature';

const TEXT_COLORS = ['#111111', '#555555', '#888888', '#0071E3', '#1D4ED8', '#4338CA', '#059669', '#D32F2F', '#D97706', '#ffffff'];
const TYPE_LABEL = { text: 'Text', contact: 'Contact details', social: 'Social icons', photo: 'Photo', button: 'Button', divider: 'Divider', spacer: 'Spacer' };
const TYPE_ICON = { text: 'text', contact: 'call', social: 'share-social', photo: 'image', button: 'radio-button-on', divider: 'remove', spacer: 'resize' };

function docFor(sig) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:16px;background:#fff">${signatureHtml(sig)}` +
    `<div style="margin-top:18px;padding-top:12px;border-top:1px dashed #e2e2ea">${SCALEMAIL_FOOTER_HTML}</div></body></html>`;
}

function Stepper({ label, value, onChange, min = 0, max = 80, step = 1, suffix = '' }) {
  return (
    <View style={styles.ctrlRow}>
      <Text style={styles.ctrlLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, (value || 0) - step))}><Ionicons name="remove" size={16} color={colors.ink} /></Pressable>
        <Text style={styles.stepVal}>{value || 0}{suffix}</Text>
        <Pressable style={styles.stepBtn} onPress={() => onChange(Math.min(max, (value || 0) + step))}><Ionicons name="add" size={16} color={colors.ink} /></Pressable>
      </View>
    </View>
  );
}
function Swatches({ list, value, onChange }) {
  return (
    <View style={styles.swatchRow}>
      {list.map((c) => (
        <Pressable key={c} onPress={() => onChange(c)} style={[styles.sw, { backgroundColor: c }, value === c && styles.swActive, c === '#ffffff' && styles.swBorder]} />
      ))}
    </View>
  );
}

export default function SignatureEditorScreen({ goBack }) {
  const { prefs, setPrefs } = useStore();
  const baseSig = useMemo(() => ({ ...EMPTY_SIG, name: prefs.signature || '', ...(prefs.sig || {}) }), []); // eslint-disable-line
  const [blocks, setBlocks] = useState(() => (baseSig.blocks && baseSig.blocks.length ? baseSig.blocks : defaultBlocks(baseSig)));
  const [openId, setOpenId] = useState(null);

  const sig = { ...baseSig, blocks };

  const patchBlock = (id, patch) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const patchStyle = (id, patch) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, style: { ...(b.style || {}), ...patch } } : b)));
  const move = (id, dir) => setBlocks((bs) => {
    const i = bs.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= bs.length) return bs;
    const next = [...bs]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  const remove = (id) => setBlocks((bs) => bs.filter((b) => b.id !== id));
  const add = (type) => { const blk = emptyBlock(type, sig); setBlocks((bs) => [...bs, blk]); setOpenId(blk.id); };

  const save = () => { setPrefs({ sig: { ...baseSig, blocks }, signature: baseSig.name || prefs.signature }); goBack(); };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title}>Signature editor</Text>
        <Pressable onPress={save} style={styles.saveBtn}><Text style={styles.saveText}>Save</Text></Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>Preview</Text>
          <View style={styles.webCard}>
            <WebView originWhitelist={['*']} source={{ html: docFor(sig) }} style={styles.web} scrollEnabled scalesPageToFit={false} />
          </View>

          <Text style={styles.section}>Blocks</Text>
          {blocks.map((b, i) => {
            const open = openId === b.id;
            const st = b.style || {};
            return (
              <View key={b.id} style={[styles.block, open && styles.blockOpen]}>
                <Pressable style={styles.blockHead} onPress={() => setOpenId(open ? null : b.id)}>
                  <Ionicons name={TYPE_ICON[b.type] || 'cube'} size={16} color={colors.blue} />
                  <Text style={styles.blockTitle} numberOfLines={1}>
                    {TYPE_LABEL[b.type]}{b.type === 'text' ? ` · ${b.text || ''}` : ''}
                  </Text>
                  <Pressable hitSlop={6} onPress={() => move(b.id, -1)} disabled={i === 0}><Ionicons name="chevron-up" size={18} color={i === 0 ? colors.ink4 : colors.ink2} /></Pressable>
                  <Pressable hitSlop={6} onPress={() => move(b.id, 1)} disabled={i === blocks.length - 1}><Ionicons name="chevron-down" size={18} color={i === blocks.length - 1 ? colors.ink4 : colors.ink2} /></Pressable>
                  <Pressable hitSlop={6} onPress={() => remove(b.id)}><Ionicons name="trash-outline" size={17} color={colors.urgent} /></Pressable>
                </Pressable>

                {open && (
                  <View style={styles.inspector}>
                    {b.type === 'text' && (
                      <>
                        <TextInput style={styles.input} value={b.text} onChangeText={(t) => patchBlock(b.id, { text: t })} placeholder="Text" placeholderTextColor={colors.ink4} multiline />
                        <TextInput style={styles.input} value={b.link} onChangeText={(t) => patchBlock(b.id, { link: t })} placeholder="Link URL (optional) — makes the text a hyperlink" placeholderTextColor={colors.ink4} autoCapitalize="none" />
                        <FontRow value={st.font} onChange={(f) => patchStyle(b.id, { font: f })} />
                        <Stepper label="Size" value={st.size || 14} min={8} max={48} onChange={(v) => patchStyle(b.id, { size: v })} suffix="px" />
                        <Text style={styles.ctrlLabel}>Color</Text>
                        <Swatches list={TEXT_COLORS} value={st.color} onChange={(c) => patchStyle(b.id, { color: c })} />
                        <AlignBoldItalic st={st} onStyle={(p) => patchStyle(b.id, p)} />
                      </>
                    )}
                    {b.type === 'button' && (
                      <>
                        <TextInput style={styles.input} value={b.label} onChangeText={(t) => patchBlock(b.id, { label: t })} placeholder="Button label" placeholderTextColor={colors.ink4} />
                        <TextInput style={styles.input} value={b.url} onChangeText={(t) => patchBlock(b.id, { url: t })} placeholder="https://… (e.g. your Calendly)" placeholderTextColor={colors.ink4} autoCapitalize="none" />
                        <Text style={styles.ctrlLabel}>Background</Text>
                        <Swatches list={ACCENTS} value={b.bg} onChange={(c) => patchBlock(b.id, { bg: c })} />
                        <Text style={styles.ctrlLabel}>Text color</Text>
                        <Swatches list={['#ffffff', '#111111']} value={b.color} onChange={(c) => patchBlock(b.id, { color: c })} />
                        <Stepper label="Corner radius" value={b.radius != null ? b.radius : 8} max={30} onChange={(v) => patchBlock(b.id, { radius: v })} suffix="px" />
                        <AlignOnly st={st} onStyle={(p) => patchStyle(b.id, p)} />
                      </>
                    )}
                    {b.type === 'photo' && (
                      <>
                        <Stepper label="Size" value={st.size || 64} min={24} max={140} onChange={(v) => patchStyle(b.id, { size: v })} suffix="px" />
                        <View style={styles.ctrlRow}>
                          <Text style={styles.ctrlLabel}>Shape</Text>
                          <View style={styles.chips}>
                            <Chip active={(st.radius ?? 50) >= 50} label="Round" onPress={() => patchStyle(b.id, { radius: 50 })} />
                            <Chip active={(st.radius ?? 50) < 50} label="Square" onPress={() => patchStyle(b.id, { radius: 12 })} />
                          </View>
                        </View>
                        <AlignOnly st={st} onStyle={(p) => patchStyle(b.id, p)} />
                        <Text style={styles.hint}>Photo comes from the signature builder. Add one there.</Text>
                      </>
                    )}
                    {b.type === 'divider' && (
                      <>
                        <Text style={styles.ctrlLabel}>Color</Text>
                        <Swatches list={['#e0e0e6', ...ACCENTS]} value={st.color} onChange={(c) => patchStyle(b.id, { color: c })} />
                        <Stepper label="Space above" value={st.marginTop || 8} onChange={(v) => patchStyle(b.id, { marginTop: v })} suffix="px" />
                        <Stepper label="Space below" value={st.marginBottom || 8} onChange={(v) => patchStyle(b.id, { marginBottom: v })} suffix="px" />
                      </>
                    )}
                    {b.type === 'spacer' && (
                      <Stepper label="Height" value={st.size || 14} max={80} onChange={(v) => patchStyle(b.id, { size: v })} suffix="px" />
                    )}
                    {(b.type === 'contact' || b.type === 'social') && (
                      <>
                        <AlignOnly st={st} onStyle={(p) => patchStyle(b.id, p)} />
                        <Text style={styles.hint}>Content comes from the details/socials in the signature builder.</Text>
                      </>
                    )}
                    {b.type !== 'divider' && b.type !== 'spacer' && (
                      <>
                        <Stepper label="Space above" value={st.marginTop || 0} onChange={(v) => patchStyle(b.id, { marginTop: v })} suffix="px" />
                        <Stepper label="Space below" value={st.marginBottom || 0} onChange={(v) => patchStyle(b.id, { marginBottom: v })} suffix="px" />
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          <Text style={styles.section}>Add block</Text>
          <View style={styles.addRow}>
            {BLOCK_TYPES.map((t) => (
              <Pressable key={t} style={styles.addBtn} onPress={() => add(t)}>
                <Ionicons name={TYPE_ICON[t]} size={15} color={colors.blue} />
                <Text style={styles.addText}>{TYPE_LABEL[t]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Chip({ active, label, onPress }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}
function FontRow({ value, onChange }) {
  return (
    <View style={styles.ctrlRow}>
      <Text style={styles.ctrlLabel}>Font</Text>
      <View style={styles.chips}>{FONTS.map((f) => <Chip key={f} active={(value || 'Arial') === f} label={f} onPress={() => onChange(f)} />)}</View>
    </View>
  );
}
function AlignOnly({ st, onStyle }) {
  return (
    <View style={styles.ctrlRow}>
      <Text style={styles.ctrlLabel}>Align</Text>
      <View style={styles.chips}>
        {['left', 'center', 'right'].map((a) => <Chip key={a} active={(st.align || 'left') === a} label={a} onPress={() => onStyle({ align: a })} />)}
      </View>
    </View>
  );
}
function AlignBoldItalic({ st, onStyle }) {
  return (
    <>
      <AlignOnly st={st} onStyle={onStyle} />
      <View style={styles.ctrlRow}>
        <Text style={styles.ctrlLabel}>Style</Text>
        <View style={styles.chips}>
          <Chip active={!!st.bold} label="Bold" onPress={() => onStyle({ bold: !st.bold })} />
          <Chip active={!!st.italic} label="Italic" onPress={() => onStyle({ italic: !st.italic })} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  cancel: { color: colors.ink3, fontSize: 16, fontWeight: '500' },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  saveBtn: { backgroundColor: colors.blue, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 18 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  body: { padding: 20, paddingBottom: 40 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.ink4, marginTop: 22, marginBottom: 8 },
  webCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden', height: 280 },
  web: { flex: 1, backgroundColor: '#fff' },
  block: { backgroundColor: colors.surface2, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: 'transparent' },
  blockOpen: { borderColor: colors.blue },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  blockTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  inspector: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  ctrlLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: 6, paddingVertical: 3 },
  stepBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 14, fontWeight: '700', color: colors.ink, minWidth: 38, textAlign: 'center' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sw: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  swActive: { borderColor: colors.ink },
  swBorder: { borderColor: colors.hairline },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#fff', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: colors.blueLight, borderColor: colors.blue },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.ink3, textTransform: 'capitalize' },
  chipTextActive: { color: colors.blue },
  hint: { fontSize: 12, color: colors.ink4, lineHeight: 17 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.blueLight, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14 },
  addText: { color: colors.blue, fontWeight: '700', fontSize: 13 },
});
