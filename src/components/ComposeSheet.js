// ComposeSheet.js — the "New Message" composer shown inside a BottomSheet.
// Sending is disabled in this read-only preview, so Send just confirms the draft.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { colors } from '../theme';
import { useStore } from '../store';

export default function ComposeSheet({ onClose }) {
  const { prefs } = useStore();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const send = () => {
    if (!to.trim()) {
      Alert.alert('Add a recipient', 'Enter who this message is going to first.');
      return;
    }
    Alert.alert('Draft ready ✓', 'Sending is off in this read-only preview — your message is composed and ready.');
    onClose();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title}>New Message</Text>
        <Pressable onPress={send} style={styles.sendBtn}><Text style={styles.sendText}>Send</Text></Pressable>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>To</Text>
        <TextInput style={styles.input} value={to} onChangeText={setTo}
          placeholder="Name or email" placeholderTextColor={colors.ink4} autoCapitalize="none" />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Re</Text>
        <TextInput style={styles.input} value={subject} onChangeText={setSubject}
          placeholder="Subject" placeholderTextColor={colors.ink4} />
      </View>

      <ScrollView style={styles.bodyWrap} keyboardShouldPersistTaps="handled">
        <TextInput style={styles.body} value={body} onChangeText={setBody}
          placeholder="Write your message…" placeholderTextColor={colors.ink4} multiline />
        <Text style={styles.sig}>{`\n${prefs.signature || 'Cameron'}`}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  cancel: { color: colors.ink3, fontSize: 16, fontWeight: '500' },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  sendBtn: {
    backgroundColor: colors.blue, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 18,
    shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  sendText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  label: { fontSize: 14, fontWeight: '500', color: colors.ink4, minWidth: 24 },
  input: { flex: 1, fontSize: 15, color: colors.ink },
  bodyWrap: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 26, color: colors.ink2, minHeight: 160, textAlignVertical: 'top' },
  sig: { fontFamily: 'Georgia', fontSize: 15, color: colors.ink3, lineHeight: 24 },
});
