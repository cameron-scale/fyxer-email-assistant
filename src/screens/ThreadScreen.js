// ThreadScreen.js — a conversation view: every message in a thread, oldest →
// newest, each with its sender, time, and body. Reply acts on the latest message.

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, ActivityIndicator, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '../theme';
import { useStore } from '../store';
import { fetchThread, isBackendConfigured, rsvpEvent, fetchAttachment } from '../lib/backend';
import { parseSender } from '../lib/priority';
import { timeAgo } from '../lib/time';
import NextStepsCard from '../components/NextStepsCard';

function fmtBytes(n = 0) { if (!n) return ''; if (n < 1024) return `${n} B`; if (n < 1048576) return `${Math.round(n / 1024)} KB`; return `${(n / 1048576).toFixed(1)} MB`; }

function emailDocument(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <style>html,body{margin:0;padding:0;width:100%;max-width:100%;overflow-x:hidden;-webkit-text-size-adjust:100%;font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;word-break:break-word;overflow-wrap:break-word}*{max-width:100%!important;box-sizing:border-box}img{max-width:100%!important;height:auto!important}table{width:100%!important;max-width:100%!important;table-layout:fixed!important}td,th{word-break:break-word}a{color:#0071E3}</style>
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
  const { emails, searchEmails, folderEmails, prefs, mailAccounts, outlookRefresh, loadFullBody, markRead, markUnread, archive, trashEmail, reportJunk } = useStore();
  const lookup = (id) => emails.find((e) => e.id === id) || (searchEmails || []).find((e) => e.id === id) || (folderEmails || []).find((e) => e.id === id);
  const seed = lookup(params.id);
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rsvpDone, setRsvpDone] = useState(null);
  const [attBusy, setAttBusy] = useState(null);

  const { token, provider } = useMemo(() => {
    const acc = (mailAccounts || []).find((a) => a.id === seed?.accountId);
    return { token: acc?.refreshToken || outlookRefresh, provider: acc?.type || (seed?.account === 'gmail' ? 'google' : 'outlook') };
  }, [seed?.accountId, mailAccounts, outlookRefresh, seed?.account]);

  // Fetch the full single message (HTML body + attachments + invite) and the
  // wider conversation, and mark it read.
  useEffect(() => {
    if (params.id && loadFullBody) loadFullBody(params.id);
    if (params.id && markRead) markRead(params.id);
  }, [params.id]); // eslint-disable-line

  useEffect(() => {
    if (!seed?.threadKey || !token) { setLoading(false); return; }
    setLoading(true);
    fetchThread(prefs.serverUrl, token, seed.threadKey, provider)
      .then((r) => setMessages(r.messages || []))
      .catch(() => setMessages(null))
      .finally(() => setLoading(false));
  }, [seed?.threadKey, token]); // eslint-disable-line

  const doRsvp = async (response) => {
    if (!seed?.invite?.eventId) return;
    try {
      await rsvpEvent(prefs.serverUrl, token, seed.invite.eventId, response);
      setRsvpDone(response);
    } catch (e) { Alert.alert('Could not RSVP', e.message || 'Try again.'); }
  };
  const openAttachment = async (a) => {
    setAttBusy(a.id);
    try {
      const { base64, contentType } = await fetchAttachment(prefs.serverUrl, token, seed.id, a.id, provider);
      if (!base64) throw new Error('Empty attachment');
      const uri = `data:${a.contentType || contentType || 'application/octet-stream'};base64,${base64}`;
      try { await WebBrowser.openBrowserAsync(uri); } catch (e) { await Linking.openURL(uri); }
    } catch (e) { Alert.alert('Could not open', e.message || 'Try again.'); }
    finally { setAttBusy(null); }
  };

  const rawList = messages && messages.length ? messages : (seed ? [{ id: seed.id, from: seed.from, date: seed.date, body: seed.body, bodyHtml: seed.bodyHtml || '' }] : []);
  // Show the newest message in the thread first (most recent at the top).
  const list = [...rawList].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const latest = list[0];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#fff" /><Text style={styles.backText}>Inbox</Text></Pressable>
        <Text style={styles.count}>{list.length} message{list.length === 1 ? '' : 's'}</Text>
      </View>
      <Text style={styles.subject} numberOfLines={2}>{seed?.subject || 'Conversation'}</Text>

      {/* Quick actions */}
      {seed && (
        <View style={styles.quickBar}>
          <QuickAction icon="archive-outline" label="Archive" onPress={() => { archive(seed.id); goBack(); }} />
          <QuickAction icon="trash-outline" label="Trash" onPress={() => { trashEmail(seed.id); goBack(); }} />
          <QuickAction icon="alert-circle-outline" label="Report" onPress={() => { reportJunk(seed.id); goBack(); }} />
          <QuickAction icon="mail-unread-outline" label="Unread" onPress={() => { markUnread(seed.id); goBack(); }} />
        </View>
      )}

      {loading ? <ActivityIndicator color={colors.blue} style={{ marginTop: 30 }} /> : (
        <ScrollView contentContainerStyle={styles.body2} showsVerticalScrollIndicator={false}>
          {list.map((m, i) => <Message key={m.id || i} msg={m} defaultOpen={i === 0} />)}

          {/* Join meeting */}
          {!!seed?.meeting?.url && (
            <Pressable style={styles.joinBtn} onPress={() => Linking.openURL(seed.meeting.url)}>
              <Ionicons name="videocam" size={18} color="#fff" /><Text style={styles.joinText}>Join {seed.meeting.provider}</Text>
            </Pressable>
          )}

          {/* Meeting RSVP */}
          {!!seed?.invite?.eventId && !seed.invite.isOrganizer && (() => {
            const answered = rsvpDone || (['accepted', 'declined', 'tentativelyAccepted'].includes(seed.invite.response) ? seed.invite.response : null);
            return (
              <View style={styles.rsvpCard}>
                <Text style={styles.rsvpTitle}>Meeting invitation</Text>
                {answered ? <Text style={styles.rsvpStatus}>You responded</Text> : (
                  <View style={styles.rsvpRow}>
                    <Pressable style={[styles.rsvpBtn, styles.rsvpAccept]} onPress={() => doRsvp('accept')}><Text style={styles.rsvpAcceptText}>Accept</Text></Pressable>
                    <Pressable style={styles.rsvpBtn} onPress={() => doRsvp('tentative')}><Text style={styles.rsvpBtnText}>Maybe</Text></Pressable>
                    <Pressable style={styles.rsvpBtn} onPress={() => doRsvp('decline')}><Text style={styles.rsvpBtnText}>Decline</Text></Pressable>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Attachments */}
          {Array.isArray(seed?.attachments) && seed.attachments.length > 0 && (
            <View style={styles.attachWrap}>
              <Text style={styles.attachHead}>{seed.attachments.length} attachment{seed.attachments.length === 1 ? '' : 's'}</Text>
              {seed.attachments.map((a) => (
                <Pressable key={a.id} style={styles.attachRow} onPress={() => openAttachment(a)}>
                  <Ionicons name="document-attach" size={20} color={colors.blue} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attachName} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.attachMeta}>{fmtBytes(a.size)}</Text>
                  </View>
                  {attBusy === a.id ? <ActivityIndicator color={colors.blue} /> : <Ionicons name="download-outline" size={20} color="rgba(255,255,255,0.5)" />}
                </Pressable>
              ))}
            </View>
          )}

          {isBackendConfigured(prefs?.serverUrl) && latest && (
            <NextStepsCard dark serverUrl={prefs.serverUrl} id={latest.id} subject={seed?.subject} body={latest.body} senderName={parseSender(latest.from || '').name} />
          )}
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

function QuickAction({ icon, label, onPress }) {
  return (
    <Pressable style={styles.qaBtn} onPress={onPress} hitSlop={6}>
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={styles.qaLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  quickBar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginHorizontal: 14, marginBottom: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  qaBtn: { alignItems: 'center', gap: 4, flex: 1 },
  qaLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
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
  joinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2D8CFF', borderRadius: 12, paddingVertical: 13, marginBottom: 10 },
  joinText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  rsvpCard: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 10 },
  rsvpTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  rsvpStatus: { color: '#5BD6A0', fontSize: 13, fontWeight: '700' },
  rsvpRow: { flexDirection: 'row', gap: 8 },
  rsvpBtn: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.12)' },
  rsvpBtnText: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 13 },
  rsvpAccept: { backgroundColor: '#1E9E63' },
  rsvpAcceptText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  attachWrap: { marginTop: 6, marginBottom: 10 },
  attachHead: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 12, marginBottom: 8 },
  attachName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  attachMeta: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 1 },
});
