// CalendarScreen.js — upcoming Outlook calendar events with RSVP. Shows what's
// coming up (grouped by day), a Join button for online meetings, and Accept /
// Maybe / Decline buttons for invites you haven't answered — writing straight
// back to your Outlook calendar via Graph.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, SectionList, ActivityIndicator, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { upcomingEvents, rsvpEvent } from '../lib/backend';

const RESP_LABEL = { accepted: 'Going', declined: 'Declined', tentativelyAccepted: 'Maybe', organizer: 'Organizer' };

function dayKey(iso) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((that - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function timeLabel(e) {
  if (e.allDay) return 'All day';
  const s = new Date(e.start);
  const opt = { hour: 'numeric', minute: '2-digit' };
  const st = s.toLocaleTimeString('en-US', opt);
  if (!e.end) return st;
  return `${st} – ${new Date(e.end).toLocaleTimeString('en-US', opt)}`;
}

export default function CalendarScreen({ goBack, navigate }) {
  const { prefs, outlookRefresh, accounts } = useStore();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    if (!outlookRefresh) { setLoading(false); return; }
    setLoading(true);
    upcomingEvents(prefs.serverUrl, outlookRefresh, 21)
      .then((r) => { setEvents(r.events || []); setNeedsReconnect(!!r.needsReconnect); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [prefs.serverUrl, outlookRefresh]);

  useEffect(() => { load(); }, [load]);

  const sections = useMemo(() => {
    const grouped = {};
    events.forEach((e) => { if (!e.start) return; const k = dayKey(e.start); (grouped[k] = grouped[k] || []).push(e); });
    return Object.entries(grouped).map(([title, data]) => ({ title, data }));
  }, [events]);

  const rsvp = async (e, response) => {
    setBusyId(e.id);
    try {
      await rsvpEvent(prefs.serverUrl, outlookRefresh, e.id, response);
      const mapped = response === 'accept' ? 'accepted' : response === 'decline' ? 'declined' : 'tentativelyAccepted';
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, response: mapped } : x)));
    } catch (err) {
      Alert.alert('Could not RSVP', err.message || 'Please try again.');
    } finally { setBusyId(null); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#fff" /><Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Calendar</Text>
        <View style={{ width: 64 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
      ) : needsReconnect ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={40} color="rgba(255,255,255,0.5)" />
          <Text style={styles.emptyTitle}>Enable calendar access</Text>
          <Text style={styles.emptySub}>Reconnect your Outlook account once to let ScaleMail show your events and RSVP to invites.</Text>
          <Pressable style={styles.cta} onPress={() => navigate('Connect')}><Text style={styles.ctaText}>Reconnect Outlook</Text></Pressable>
        </View>
      ) : !accounts.outlook ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={40} color="rgba(255,255,255,0.5)" />
          <Text style={styles.emptyTitle}>Connect your email</Text>
          <Text style={styles.emptySub}>Connect Outlook to see your upcoming events here.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHead}>{section.title}</Text>}
          renderItem={({ item }) => {
            const answered = ['accepted', 'declined', 'tentativelyAccepted', 'organizer'].includes(item.response);
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.time}>{timeLabel(item)}</Text>
                  {answered && <Text style={[styles.respTag, item.response === 'declined' && { color: '#FF6B6B' }]}>{RESP_LABEL[item.response]}</Text>}
                </View>
                <Text style={styles.subject} numberOfLines={2}>{item.subject}</Text>
                {!!item.location && <Text style={styles.meta} numberOfLines={1}><Ionicons name="location-outline" size={12} /> {item.location}</Text>}
                {!!item.organizer && !item.isOrganizer && <Text style={styles.meta} numberOfLines={1}>From {item.organizer}</Text>}
                <View style={styles.actions}>
                  {!!item.joinUrl && (
                    <Pressable style={styles.join} onPress={() => Linking.openURL(item.joinUrl)}>
                      <Ionicons name="videocam" size={14} color="#fff" /><Text style={styles.joinText}>Join</Text>
                    </Pressable>
                  )}
                  {!answered && !item.isOrganizer && (
                    busyId === item.id ? <ActivityIndicator color={colors.blue} style={{ marginLeft: 8 }} /> : (
                      <View style={styles.rsvpRow}>
                        <Pressable style={[styles.rsvp, styles.accept]} onPress={() => rsvp(item, 'accept')}><Text style={styles.acceptText}>Accept</Text></Pressable>
                        <Pressable style={styles.rsvp} onPress={() => rsvp(item, 'tentative')}><Text style={styles.rsvpText}>Maybe</Text></Pressable>
                        <Pressable style={styles.rsvp} onPress={() => rsvp(item, 'decline')}><Text style={styles.rsvpText}>Decline</Text></Pressable>
                      </View>
                    )
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Nothing on your calendar for the next few weeks. 🎉</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  sectionHead: { color: colors.blue, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: 16, paddingBottom: 8, paddingHorizontal: 4 },
  card: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { color: '#fff', fontSize: 13, fontWeight: '700' },
  respTag: { color: '#5BD6A0', fontSize: 12, fontWeight: '700' },
  subject: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  meta: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 },
  join: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.blue, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 14 },
  joinText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rsvpRow: { flexDirection: 'row', gap: 8 },
  rsvp: { borderRadius: 16, paddingVertical: 6, paddingHorizontal: 13, backgroundColor: 'rgba(255,255,255,0.12)' },
  rsvpText: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 13 },
  accept: { backgroundColor: '#1E9E63' },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cta: { backgroundColor: colors.blue, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', marginTop: 60 },
});
