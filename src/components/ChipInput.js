// ChipInput.js — a text field that turns each entry into a removable bubble when
// you type a comma (multi-word entries like "Saks Fifth Avenue" stay intact).
// Value is the array of chips; onChange returns the updated array.

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export default function ChipInput({ value = [], onChange, placeholder, autoCapitalize = 'none', keyboardType }) {
  const [text, setText] = useState('');
  const chips = Array.isArray(value) ? value : [];

  const addChip = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return;
    if (!chips.some((c) => c.toLowerCase() === v.toLowerCase())) onChange([...chips, v]);
  };

  const handleChange = (t) => {
    // Commit a chip every time a comma is typed; keep the rest in the field.
    if (t.includes(',')) {
      const parts = t.split(',');
      const tail = parts.pop();
      parts.forEach((p) => addChip(p));
      setText(tail.replace(/^\s+/, ''));
    } else {
      setText(t);
    }
  };

  const commit = () => { if (text.trim()) { addChip(text); setText(''); } };
  const removeChip = (i) => onChange(chips.filter((_, idx) => idx !== i));

  return (
    <View style={styles.wrap}>
      {chips.map((c, i) => (
        <Pressable key={`${c}-${i}`} style={styles.chip} onPress={() => removeChip(i)}>
          <Text style={styles.chipText}>{c}</Text>
          <Ionicons name="close" size={13} color="rgba(255,255,255,0.7)" />
        </Pressable>
      ))}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={handleChange}
        onBlur={commit}
        onSubmitEditing={commit}
        blurOnSubmit={false}
        placeholder={chips.length ? 'Add another…' : placeholder}
        placeholderTextColor={colors.textFaint}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, minHeight: 48,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,113,227,0.18)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.4)',
    borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10,
  },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  input: { flexGrow: 1, minWidth: 120, fontSize: 15, color: colors.text, paddingVertical: 2 },
});
