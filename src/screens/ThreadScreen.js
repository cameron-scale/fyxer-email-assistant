// ThreadScreen.js — a conversation view: every message in a thread, oldest →
// newest, each with its sender, time, and body. Reply acts on the latest message.

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, ActivityIndicator, Linking, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '../theme';
import { useStore } from '../store';
import { fetchThread, isBackendConfigured, rsvpEvent, fetchAttachment } from '../lib/backend';
import { parseSender } from '../lib/priority';
import { CLASSIFY_LABELS, labelName } from '../lib/labels';
import { timeAgo } from '../lib/time';
import NextStepsCard from '../components/NextStepsCard';

function fmtBytes(n = 0) { if (!n) return ''; if (n < 1024) return `${n} B`; if (n < 1048576) return `${Math.round(n / 1024)} KB`; return `${(n / 1048576).toFixed(1)} MB`; }

function emailDocument(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>html,body{margin:0;padding:0;width:100%;max-width:100%;overflow-x:hidden;-webkit-text-size-adjust:100%;font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;word-break:break-word;overflow-wrap:break-word}*{max-width:100%!important;box-sizing:border-box}img{max-width:100%!important;height:auto}table{max-width:100%!important}td,th{word-break:break-word}a{color:#0071E3}</style>
  </head><body>${html}</body></html>`;
}

// Measure height AND shrink any email wider than the screen so banners/images
// that use fixed pixel widths fit instead of running off the right edge.
const FIT_JS = `(function(){
  var last=0;
  function fit(){
    try{
      var b=document.body, vw=window.innerWidth;
      var sw=Math.max(b.scrollWidth, document.documentElement.scrollWidth);
      if(sw>vw+2){ b.style.transformOrigin='0 0'; b.style.zoom=(vw/sw); }
    }catch(e){}
    try{
      // Measure the RENDERED (post-zoom) height via bounding rects — using the raw
      // scrollHeight after a CSS zoom reports the un-scaled height and leaves a big
      // empty gap below the body.
      var rect = document.body.getBoundingClientRect();
      var h = Math.ceil(Math.max(rect.bottom, document.documentElement.getBoundingClientRect().height));
      // Only post when the height actually changed, so we don't spin the bridge.
      if(h && Math.abs(h-last) > 1){ last=h; window.ReactNativeWebView.postMessage(String(h)); }
    }catch(e){}
  }
  // Re-measure whenever the layout changes: as fonts/images/tables finish loading
  // the body grows, and without this the WebView stays at its first (too-short)
  // height and the email looks cut off until you leave and come back.
  try{ if(window.ResizeObserver){ new ResizeObserver(fit).observe(document.body); } }catch(e){}
  try{
    var imgs=document.images||[];
    for(var i=0;i<imgs.length;i++){
      if(!imgs[i].complete){ imgs[i].addEventListener('load',fit); imgs[i].addEventListener('error',fit); }
    }
  }catch(e){}
  document.addEventListener('DOMContentLoaded',fit);
  window.addEventListener('load',fit);
  // Safety net of delayed passes for anything the observers miss (very slow images,
  // web fonts, remote CSS).
  [0,120,300,600,1000,1800,3000].forEach(function(t){ setTimeout(fit,t); });
})(); true;`;

function partyName(s, me) {
  const p = parseSender(s || '');
  if (me && p.email && me.has(p.email)) return 'me';
  return p.name || p.email || s;
}
function Message({ msg, defaultOpen, me }) {
  const [open, setOpen] = useState(defaultOpen);
  const [recipOpen, setRecipOpen] = useState(false);
  const [h, setH] = useState(120);
  const sender = parseSender(msg.from || '');
  const to = msg.to || [];
  const cc = msg.cc || [];
  const hasRecip = to.length > 0 || cc.length > 0;
  const namesLine = `To: ${to.map((x) => partyName(x, me)).join(', ') || '—'}${cc.length ? `\nCc: ${cc.map((x) => partyName(x, me)).join(', ')}` : ''}`;
  return (
    <View style={styles.msg}>
      <Pressable style={styles.msgHead} onPress={() => setOpen((v) => !v)}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(sender.name || '?').slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.from} numberOfLines={1}>{sender.name || sender.email}</Text>
          {!!sender.email && !!sender.name && <Text style={styles.fromEmail} numberOfLines={1}>{sender.email}</Text>}
          {!open && <Text style={styles.snip} numberOfLines={1}>{msg.body}</Text>}
        </View>
        <Text style={styles.time}>{msg.date ? timeAgo(msg.date) : ''}</Text>
      </Pressable>
      {open && hasRecip && (
        <Pressable style={styles.recipRow} onPress={() => setRecipOpen((v) => !v)}>
          <Ionicons name="people-outline" size={13} color="rgba(255,255,255,0.5)" style={{ marginTop: 1 }} />
          <Text style={styles.recipText} numberOfLines={recipOpen ? undefined : 1}>
            {recipOpen ? namesLine : `To: ${to.map((x) => partyName(x, me)).join(', ') || '—'}${cc.length ? `  +${cc.length} Cc` : ''}`}
          </Text>
          <Ionicons name={recipOpen ? 'chevron-up' : 'chevron-down'} size={13} color="rgba(255,255,255,0.4)" />
        </Pressable>
      )}
      {open && (
        msg.bodyHtml ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: emailDocument(msg.bodyHtml) }}
            style={{ height: h, backgroundColor: 'transparent' }}
            scrollEnabled={false}
            injectedJavaScript={FIT_JS}
            onMessage={(e) => { const n = Number(e.nativeEvent.data); if (n && n > 40) setH(n + 4); }}
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
  const { emails, searchEmails, folderEmails, findEmail, prefs, setPrefs, mailAccounts, outlookRefresh, loadFullBody, markRead, markUnread, archive, trashEmail, reportJunk, snooze, toggleVip, vips, classifySenders, isWatched, toggleWatch, isPinned, togglePin } = useStore();
  const seed = findEmail(params.id);
  const myEmails = useMemo(() => new Set((mailAccounts || []).map((a) => (a.email || '').toLowerCase()).filter(Boolean)), [mailAccounts]);
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rsvpDone, setRsvpDone] = useState(null);
  const [attBusy, setAttBusy] = useState(null);
  const [attView, setAttView] = useState(null); // { uri, name, type }
  const [moreOpen, setMoreOpen] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const watching = seed ? isWatched(seed) : false;
  const pinned = seed ? isPinned(seed.id) : false;
  const currentLabel = (prefs?.senderLabels || {})[(seed?.priority?.senderEmail || parseSender(seed?.from || '').email || '').toLowerCase()] || null;

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

  // When the thread changes (e.g. advance() reuses this same screen instance for
  // the next email), drop the previous conversation's per-message state so the old
  // messages/RSVP can't render under the new email's subject.
  useEffect(() => {
    setMessages(null);
    setRsvpDone(null);
  }, [params.id]);

  useEffect(() => {
    if (!seed?.threadKey || !token) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchThread(prefs.serverUrl, token, seed.threadKey, provider)
      .then((r) => { if (!cancelled) setMessages(r.messages || []); })
      .catch(() => { if (!cancelled) setMessages(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.id, seed?.threadKey, token]); // eslint-disable-line

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
      const type = a.contentType || contentType || 'application/octet-stream';
      const uri = `data:${type};base64,${base64}`;
      // iOS can't open a data: URL via Linking/Browser — render it in a WebView
      // (WKWebView shows PDFs and images inline).
      setAttView({ uri, name: a.name, type });
    } catch (e) { Alert.alert('Could not open', e.message || 'Try again.'); }
    finally { setAttBusy(null); }
  };

  const rawList = messages && messages.length ? messages : (seed ? [{ id: seed.id, from: seed.from, date: seed.date, body: seed.body, bodyHtml: seed.bodyHtml || '' }] : []);
  // Show the newest message in the thread first (most recent at the top).
  const list = [...rawList].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const latest = list[0];

  const senderEmail = (seed?.priority?.senderEmail || parseSender(seed?.from || '').email || '').toLowerCase();
  const senderNote = (prefs?.senderNotes || {})[senderEmail] || '';
  const isVipSender = (vips || []).map((v) => String(v).toLowerCase()).includes(senderEmail);

  // Run a triage action, then jump straight to the next email's thread (instead of
  // bouncing back to the inbox). Compute the next id BEFORE acting.
  const advance = (fn) => {
    const ctx = (emails || []).some((e) => e.id === seed?.id) ? emails
      : (searchEmails || []).some((e) => e.id === seed?.id) ? searchEmails
      : (folderEmails || []);
    const idx = (ctx || []).findIndex((e) => e.id === seed?.id);
    const nextId = idx >= 0 && idx + 1 < ctx.length ? ctx[idx + 1].id : null;
    fn(seed.id);
    if (nextId) { goBack(); navigate('Thread', { id: nextId }); } else { goBack(); }
  };

  // Teach the AI something about this sender that it remembers going forward
  // ("this is my client", "favorite brand"). Stored per-sender + fed to the AI.
  const teachAI = () => {
    if (typeof Alert.prompt !== 'function') {
      Alert.alert('Tip', 'Add a note about this sender on iOS to teach ScaleMail (e.g. "this is my client").');
      return;
    }
    Alert.prompt(
      'Teach ScaleMail',
      `A note about ${seed?.priority?.senderName || senderEmail || 'this sender'} that the AI will remember (e.g. "this is my client", "favorite brand").`,
      (text) => {
        const note = String(text || '').trim();
        if (!note || !senderEmail) return;
        const notes = { ...(prefs?.senderNotes || {}), [senderEmail]: note };
        setPrefs({ senderNotes: notes });
        Alert.alert('Got it ✓', 'ScaleMail will remember that for this sender.');
      },
      'plain-text',
      senderNote,
    );
  };

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
          <QuickAction icon="archive-outline" label="Archive" onPress={() => advance(archive)} />
          <QuickAction icon="trash-outline" label="Trash" onPress={() => advance(trashEmail)} />
          <QuickAction icon="alert-circle-outline" label="Report" onPress={() => advance(reportJunk)} />
          <QuickAction icon="mail-unread-outline" label="Unread" onPress={() => advance(markUnread)} />
          <QuickAction icon="ellipsis-horizontal" label="More" onPress={() => setMoreOpen(true)} />
        </View>
      )}

      {/* More actions menu */}
      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.moreBackdrop} onPress={() => setMoreOpen(false)}>
          <View style={styles.moreSheet}>
            <MoreItem icon={watching ? 'eye' : 'eye-outline'} iconColor={watching ? '#7DD3FC' : undefined} label={watching ? 'Stop keeping an eye on this' : 'Keep an eye on this'} onPress={() => { setMoreOpen(false); if (seed) toggleWatch(seed.id); }} />
            <MoreItem icon={pinned ? 'bookmark' : 'bookmark-outline'} iconColor={pinned ? '#F59E0B' : undefined} label={pinned ? 'Unpin' : 'Pin to Pinned page'} onPress={() => { setMoreOpen(false); if (seed) togglePin(seed.id); }} />
            <MoreItem icon="pricetag-outline" label={currentLabel ? `Classify sender (now: ${labelName(currentLabel)})` : 'Classify sender'} onPress={() => { setMoreOpen(false); setClassifyOpen(true); }} />
            <MoreItem icon="bulb-outline" label="Teach AI about this sender" onPress={() => { setMoreOpen(false); teachAI(); }} />
            <MoreItem icon="time-outline" label="Snooze 4 hours" onPress={() => { setMoreOpen(false); if (seed) advance((id) => snooze(id, 4)); }} />
            <MoreItem icon={isVipSender ? 'star' : 'star-outline'} label={isVipSender ? 'Remove from VIPs' : 'Add sender to VIPs'} onPress={() => { setMoreOpen(false); if (senderEmail) toggleVip(senderEmail); }} />
            <MoreItem icon="mail-open-outline" label="Mark as read" onPress={() => { setMoreOpen(false); if (seed) { markRead(seed.id); goBack(); } }} />
            <MoreItem icon="close" label="Cancel" onPress={() => setMoreOpen(false)} muted />
          </View>
        </Pressable>
      </Modal>

      {/* Classify this sender */}
      <Modal visible={classifyOpen} transparent animationType="fade" onRequestClose={() => setClassifyOpen(false)}>
        <Pressable style={styles.moreBackdrop} onPress={() => setClassifyOpen(false)}>
          <View style={styles.moreSheet}>
            <Text style={styles.classifyHead}>Classify {seed?.priority?.senderName || 'this sender'}</Text>
            {CLASSIFY_LABELS.map((l) => (
              <MoreItem
                key={l.key}
                icon={l.icon}
                iconColor={l.color}
                label={currentLabel === l.key ? `${l.name}  ✓` : l.name}
                onPress={() => {
                  setClassifyOpen(false);
                  if (seed) classifySenders([seed.id], l.key);
                  if (l.key === 'junk') goBack();
                }}
              />
            ))}
            <MoreItem icon="close" label="Cancel" onPress={() => setClassifyOpen(false)} muted />
          </View>
        </Pressable>
      </Modal>

      {loading ? <ActivityIndicator color={colors.blue} style={{ marginTop: 30 }} /> : (
        <ScrollView contentContainerStyle={styles.body2} showsVerticalScrollIndicator={false}>
          {/* AI summary / recommended next steps — above the body for a quick gist */}
          {isBackendConfigured(prefs?.serverUrl) && latest && (
            <View style={{ marginBottom: 16 }}>
              <NextStepsCard dark serverUrl={prefs.serverUrl} id={latest.id} subject={seed?.subject} body={latest.body} senderName={parseSender(latest.from || '').name} note={senderNote} />
            </View>
          )}
          {list.map((m, i) => <Message key={m.id || i} msg={m} defaultOpen={i === 0} me={myEmails} />)}

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

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {seed && latest && (
        <Pressable style={styles.replyBar} onPress={() => navigate('Reply', { id: seed.id })}>
          <Ionicons name="arrow-undo" size={18} color="#fff" />
          <Text style={styles.replyText}>Reply</Text>
        </Pressable>
      )}

      {/* Attachment viewer — renders PDFs/images inline (iOS can't open data: URLs) */}
      <Modal visible={!!attView} animationType="slide" onRequestClose={() => setAttView(null)}>
        <SafeAreaView style={styles.attViewer}>
          <View style={styles.attViewerBar}>
            <Text style={styles.attViewerName} numberOfLines={1}>{attView?.name || 'Attachment'}</Text>
            <Pressable hitSlop={10} onPress={() => setAttView(null)}><Ionicons name="close" size={24} color="#fff" /></Pressable>
          </View>
          {!!attView && (
            <WebView
              originWhitelist={['*']}
              source={{ uri: attView.uri }}
              style={{ flex: 1, backgroundColor: '#fff' }}
              startInLoadingState
              renderLoading={() => <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function MoreItem({ icon, label, onPress, muted, iconColor }) {
  return (
    <Pressable style={styles.moreItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={iconColor || (muted ? 'rgba(255,255,255,0.5)' : '#fff')} />
      <Text style={[styles.moreItemText, muted && { color: 'rgba(255,255,255,0.5)' }]}>{label}</Text>
    </Pressable>
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
  moreBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  moreSheet: { backgroundColor: '#161B26', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8, paddingBottom: 36 },
  moreItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 22 },
  moreItemText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  classifyHead: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  attViewer: { flex: 1, backgroundColor: '#0B0E14' },
  attViewerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  attViewerName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
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
  recipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  recipText: { flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: 12.5, lineHeight: 18 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  from: { fontSize: 14, fontWeight: '700', color: colors.ink },
  fromEmail: { fontSize: 12, color: colors.ink3, marginTop: 1 },
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
