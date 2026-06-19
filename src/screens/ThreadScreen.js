// ThreadScreen.js — a conversation view: every message in a thread, oldest →
// newest, each with its sender, time, and body. Reply acts on the latest message.

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { colors } from '../theme';
import { useStore } from '../store';
import { fetchThread } from '../lib/backend';
import { parseSender } from '../lib/priority';
import { timeAgo } from '../lib/time';

function emailDocument(html) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;margin:0;padding:0;word-break:break-word}img{max-width:100%;height:auto}a{color:#0071E3}</style>
  </head><body>${html}</body></html>`;
}

function Message({ msg, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const [h, setH] = useState(120);
  const sender = parseSender(msg.from || '');
  return (
    <View style={styles.msg}>
      <Pressable style={styles.msgHead} onPress={() => setOpen((v) => !v)}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(sender.name || '?').slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.from} numberOfLines={1}>{sender.name || sender.email}</Text>
          {!open && <Text style={styles.snip} numberOfLines={1}>{msg.body}</Text>}
        </View>
        <Text style={styles.time}>{msg.date ? timeAgo(msg.date) : ''}</Text>
      </Pressable>
      {open && (
        msg.bodyHtml ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: emailDocument(msg.bodyHtml) }}
            style={{ height: h, backgroundColor: 'transparent' }}
            scrollEnabled={false}
            injectedJavaScript={'setTimeout(function(){window.ReactNativeWebView.postMessage(String(document.body.scrollHeight));},60);true;'}
            onMessage={(e) => { const n = Number(e.nativeEvent.data); if (n && n > 40) setH(n + 20); }}
            onShouldStartLoadWithRequest={(r) => { if (r.url === 'about:blank' || r.url.startsWith('data:')) return true; Linking.openURL(r.url).catch(() => {}); return false; }}
          />
        ) : (
          <Text style={styles.body}>{msg.body}</Text>
        )
      )}
    </View>
  );
}

export default function ThreadScreen({ goBack, navigate, params }) {
  const { emails, searchEmails, folderEmails, prefs, mailAccounts, outlookRefresh } = useStore();
  const lookup = (id) => emails.find((e) => e.id === id) || (searchEmails || []).find((e) => e.id === id) || (folderEmails || []).find((e) => e.id === id);
  const seed = lookup(params.id);
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);

  const { token, provider } = useMemo(() => {
    const acc = (mailAccounts || []).find((a) => a.id === seed?.accountId);
    return { token: acc?.refreshToken || outlookRefresh, provider: acc?.type || (seed?.account === 'gmail' ? 'google' : 'outlook') };
  }, [seed?.accountId, mailAccounts, outlookRefresh, seed?.account]);

  useEffect(() => {
    if (!seed?.threadKey || !token) { setLoading(false); return; }
    setLoading(true);
    fetchThread(prefs.serverUrl, token, seed.threadKey, provider)
      .then((r) => setMessages(r.messages || []))
      .catch(() => setMessages(null))
      .finally(() => setLoading(false));
  }, [seed?.threadKey, token]); // eslint-disable-line

  const list = messages && messages.length ? messages : (seed ? [{ id: seed.id, from: seed.from, date: seed.date, body: seed.body, bodyHtml: seed.bodyHtml || '' }] : []);
  const latest = list[list.length - 1];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#fff" /><Text style={styles.backText}>Inbox</Text></Pressable>
        <Text style={styles.count}>{list.length} message{list.length === 1 ? '' : 's'}</Text>
      </View>
      <Text style={styles.subject} numberOfLines={2}>{seed?.subject || 'Conversation'}</Text>

      {loading ? <ActivityIndicator color={colors.blue} style={{ marginTop: 30 }} /> : (
        <ScrollView contentContainerStyle={styles.body2} showsVerticalScrollIndicator={false}>
          {list.map((m, i) => <Message key={m.id || i} msg={m} defaultOpen={i === list.length - 1} />)}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {seed && latest && (
        <Pressable style={styles.replyBar} onPress={() => navigate('Reply', { id: seed.id })}>
          <Ionicons name="arrow-undo" size={18} color="#fff" />
          <Text style={styles.replyText}>Reply</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  count: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  subject: { color: '#fff', fontSize: 22, fontWeight: '800', paddingHorizontal: 18, paddingBottom: 12, letterSpacing: -0.4 },
  body2: { paddingHorizontal: 14 },
  msg: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10 },
  msgHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  from: { fontSize: 14, fontWeight: '700', color: colors.ink },
  snip: { fontSize: 12.5, color: colors.ink3, marginTop: 1 },
  time: { fontSize: 12, color: colors.ink4 },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink2, marginTop: 12 },
  replyBar: { position: 'absolute', left: 16, right: 16, bottom: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.blue, borderRadius: 26, paddingVertical: 14, shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  replyText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
