// CategoriesScreen.js — manage custom inbox categories. Each category has a name,
// a color, keyword rules, and a sender list. Sender matches force the category;
// keyword matches apply it. These layer on top of the built-in six (Urgent,
// Action Needed, Meeting, Client, Newsletter, FYI).

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView, TextInput, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { useStore } from '../store';

const COLORS = ['#0071E3', '#1D4ED8', '#4338CA', '#7C3AED', '#059669', '#0891B2', '#D97706', '#D32F2F', '#475569', '#111111'];
const newId = () => Math.random().toString(36).slice(2, 9);
const csv = (arr) => (arr || []).join(', ');
const parseCsv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export default function CategoriesScreen({ goBack }) {
  const { prefs, setPrefs } = useStore();
  const [cats, setCats] = useState(() => (prefs.categories || []).map((c) => ({ ...c })));

  const patch = (id, p) => setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const add = () => setCats((cs) => [...cs, { id: newId(), name: '', color: COLORS[cs.length % COLORS.length], keywords: [], senders: [] }]);
  const remove = (id) => setCats((cs) => cs.filter((c) => c.id !== id));

  const save = () => {
    setPrefs({ categories: cats.filter((c) => c.name.trim()) });
    goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title}>Categories</Text>
        <Pressable onPress={save} style={styles.saveBtn}><Text style={styles.saveText}>Save</Text></Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Built-in: Urgent · Action Needed · Meeting · Client · Newsletter · FYI. Add your
            own below — e.g. a “Project X” category for certain senders or keywords.
          </Text>

          {cats.map((c) => (
            <View key={c.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.dot, { backgroundColor: c.color }]} />
                <TextInput style={styles.nameInput} value={c.name} onChangeText={(t) => patch(c.id, { name: t })} placeholder="Category name" placeholderTextColor={colors.ink4} />
                <Pressable hitSlop={6} onPress={() => remove(c.id)}><Ionicons name="trash-outline" size={18} color={colors.urgent} /></Pressable>
              </View>

              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.swatches}>
                {COLORS.map((col) => (
                  <Pressable key={col} onPress={() => patch(c.id, { color: col })} style={[styles.sw, { backgroundColor: col }, c.color === col && styles.swActive]} />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Keywords (comma-separated)</Text>
              <TextInput style={styles.input} defaultValue={csv(c.keywords)} onChangeText={(t) => patch(c.id, { keywords: parseCsv(t) })} placeholder="invoice, proposal, project x" placeholderTextColor={colors.ink4} autoCapitalize="none" />

              <Text style={styles.fieldLabel}>Senders (comma-separated emails/domains)</Text>
              <TextInput style={styles.input} defaultValue={csv(c.senders)} onChangeText={(t) => patch(c.id, { senders: parseCsv(t) })} placeholder="jane@acme.com, @bigclient.com" placeholderTextColor={colors.ink4} autoCapitalize="none" />
            </View>
          ))}

          <Pressable style={styles.addBtn} onPress={add}>
            <Ionicons name="add" size={18} color={colors.blue} />
            <Text style={styles.addText}>Add category</Text>
          </Pressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  intro: { fontSize: 13, color: colors.ink3, lineHeight: 19, marginBottom: 16 },
  card: { backgroundColor: colors.surface2, borderRadius: 14, padding: 14, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  nameInput: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.ink3, marginTop: 10, marginBottom: 6 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sw: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  swActive: { borderColor: colors.ink },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.blueLight, borderRadius: 12, paddingVertical: 13 },
  addText: { color: colors.blue, fontWeight: '700', fontSize: 14 },
});
