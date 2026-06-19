// CalendarScreen.js — upcoming Outlook calendar events with RSVP. Shows what's
// coming up (grouped by day), a week strip, a Join button for online meetings,
// and Accept / Maybe / Decline buttons for invites you haven't answered —
// writing straight back to your Outlook calendar via Graph.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, SectionList, ActivityIndicator, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { upcomingEvents, rsvpEvent } from '../lib/backend';

const TYPE_COLORS = { meeting: '#3B82F6', subscription: '#F59E0B', tool: '#8B5CF6', approval: '#10B981' };

// Infer event type from subject keywords → returns the left-bar color.
function eventType(subject) {
  const s = (subject || '').toLowerCase();
  if (/subscription|renew|invoice|billing|payment/.test(s)) return TYPE_COLORS.subscription;
  if (/trial|tool|demo|onboarding|setup/.test(s)) return TYPE_COLORS.tool;
  if (/approve|approval|sign|review|sign-off/.test(s)) return TYPE_COLORS.approval;
  return TYPE_COLORS.meeting;
}

// "Today" / "Tomorrow" / "Wed, Jun 24" — robust against null.
function dayKey(iso) {
  if (!iso) return 'Scheduled';
  const d = new Date(iso);
  if (isNaN(d)) return 'Scheduled';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((that - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Format a timed event's start–end range in local time.
function timeRange(e) {
  if (!e.start) return '';
  const s = new Date(e.start);
  if (isNaN(s)) return '';
  const opt = { hour: 'numeric', minute: '2-digit' };
  const st = s.toLocaleTimeString('en-US', opt);
  if (!e.end) return st;
  const en = new Date(e.end);
  if (isNaN(en)) return st;
  return `${st} – ${en.toLocaleTimeString('en-US', opt)}`;
}

// Local Y-M-D key for comparing event dates to week-strip days.
function localDateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function joinLabel(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('zoom')) return 'Join Zoom';
  if (u.includes('meet.google')) return 'Join Meet';
  if (u.includes('teams')) return 'Join Teams';
  return 'Join';
}

const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export default function CalendarScreen({ goBack, navigate }) {
  const { prefs, outlookRefresh, accounts, mailAccounts, activeAccountId, emails, searchEmails } = useStore();

  // Many events are created from an email invite — tapping the event finds that
  // email (by matching subject) and opens it.
  const openEventEmail = (item) => {
    const norm = (s) => String(s || '').toLowerCase().replace(/^\s*(re|fwd|fw|invitation:|accepted:|declined:|tentative:|canceled:|updated invitation:)\s*:?\s*/i, '').trim();
    const target = norm(item.subject);
    if (!target) return;
    const pool = [...(emails || []), ...(searchEmails || [])];
    const hit = pool.find((e) => { const s = norm(e.subject); return s && (s === target || s.includes(target) || target.includes(s)); });
    if (hit) navigate('Thread', { id: hit.id });
    else if (item.joinUrl) Linking.openURL(item.joinUrl).catch(() => {});
  };
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Which linked accounts to pull calendars from (the active one, or every one
  // when viewing "All"). Falls back to the legacy Outlook token.
  const calAccounts = useMemo(() => {
    const list = (mailAccounts && mailAccounts.length)
      ? (activeAccountId === 'all' ? mailAccounts : mailAccounts.filter((a) => a.id === activeAccountId))
      : (outlookRefresh ? [{ id: 'legacy', type: 'outlook', refreshToken: outlookRefresh }] : []);
    return list;
  }, [mailAccounts, activeAccountId, outlookRefresh]);

  const load = useCallback(() => {
    if (!calAccounts.length) { setLoading(false); return; }
    setLoading(true);
    Promise.all(calAccounts.map((a) => {
      const provider = a.type === 'google' ? 'google' : a.type === 'icloud' ? 'icloud' : 'outlook';
      return upcomingEvents(prefs.serverUrl, a.refreshToken, 21, provider)
        .then((r) => ({ events: (r.events || []).map((e) => ({ ...e, _accId: a.id, _token: a.refreshToken, _provider: provider })), needsReconnect: !!r.needsReconnect }))
        .catch(() => ({ events: [], needsReconnect: false }));
    })).then((results) => {
      const merged = results.flatMap((r) => r.events).sort((x, y) => new Date(x.start || 0) - new Date(y.start || 0));
      setEvents(merged);
      // Only flag reconnect if EVERY account needs it (so one good account still shows).
      setNeedsReconnect(results.length > 0 && results.every((r) => r.needsReconnect));
    }).finally(() => setLoading(false));
  }, [prefs.serverUrl, calAccounts]);

  useEffect(() => { load(); }, [load]);

  const sections = useMemo(() => {
    const grouped = {};
    const order = [];
    events.forEach((e) => {
      if (!e.start) return;
      const k = dayKey(e.start);
      if (!grouped[k]) { grouped[k] = []; order.push(k); }
      grouped[k].push(e);
    });
    return order.map((title) => ({ title, data: grouped[title] }));
  }, [events]);

  // The current Mon–Sun week, with a flag for which days carry events.
  const week = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7; // 0 = Monday
    const monday = new Date(today); monday.setDate(today.getDate() - dow);

    const eventDays = new Set();
    events.forEach((e) => {
      if (!e.start) return;
      const d = new Date(e.start);
      if (isNaN(d)) return;
      eventDays.add(localDateKey(d));
    });

    const todayKey = localDateKey(today);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const key = localDateKey(d);
      return {
        label: DOW[i],
        date: d.getDate(),
        isToday: key === todayKey,
        hasEvents: eventDays.has(key),
      };
    });
  }, [events]);

  const rsvp = async (e, response) => {
    setBusyId(e.id);
    try {
      await rsvpEvent(prefs.serverUrl, e._token || outlookRefresh, e.id, response, e._provider || 'outlook');
      const mapped = response === 'accept' ? 'accepted' : response === 'decline' ? 'declined' : 'tentativelyAccepted';
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, response: mapped } : x)));
    } catch (err) {
      Alert.alert('Could not RSVP', err.message || 'Please try again.');
    } finally { setBusyId(null); }
  };

  const renderNav = () => (
    <View style={styles.nav}>
      <Pressable style={styles.back} onPress={goBack} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color="#fff" /><Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Calendar</Text>
      <View style={{ width: 64 }} />
    </View>
  );

  const renderWeek = () => (
    <View style={styles.weekStrip}>
      {week.map((d, i) => (
        <View key={i} style={styles.dayCell}>
          <Text style={styles.dowLabel}>{d.label}</Text>
          <View style={[styles.dayCircle, d.isToday ? styles.dayCircleToday : styles.dayCircleIdle]}>
            <Text style={[styles.dayNum, d.isToday ? styles.dayNumToday : (d.hasEvents ? styles.dayNumActive : styles.dayNumIdle)]}>{d.date}</Text>
          </View>
          {d.hasEvents ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
        </View>
      ))}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyBox}>
      <Ionicons name="checkmark-circle-outline" size={40} color="rgba(255,255,255,0.5)" />
      <Text style={styles.emptyTitle}>Clear schedule ahead</Text>
      <Text style={styles.emptySub}>Nothing on the calendar until next week.</Text>
    </View>
  );

  const renderCard = (item) => {
    const isOrg = item.isOrganizer || item.response === 'organizer';
    const answered = ['accepted', 'declined', 'tentativelyAccepted', 'organizer'].includes(item.response) || isOrg;
    const barColor = eventType(item.subject);

    let pill = null;
    if (isOrg) pill = { label: 'Organizer', bg: 'rgba(26,107,255,0.18)', fg: '#7DB3FF' };
    else if (item.response === 'accepted') pill = { label: 'Going', bg: 'rgba(16,185,129,0.16)', fg: '#34D399' };
    else if (item.response === 'declined') pill = { label: 'Declined', bg: 'rgba(239,68,68,0.16)', fg: '#F87171' };
    else if (item.response === 'tentativelyAccepted') pill = { label: 'Maybe', bg: 'rgba(255,255,255,0.12)', fg: 'rgba(255,255,255,0.8)' };

    return (
      <Pressable style={styles.card} onPress={() => openEventEmail(item)}>
        <View style={[styles.bar, { backgroundColor: barColor }]} />
        <View style={styles.body}>
          {pill && (
            <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
              <Text style={[styles.statusPillText, { color: pill.fg }]}>{pill.label}</Text>
            </View>
          )}

          {item.allDay ? (
            <View style={styles.allDayPill}><Text style={styles.allDayText}>All day</Text></View>
          ) : (
            !!timeRange(item) && <Text style={styles.time}>{timeRange(item)}</Text>
          )}

          <Text style={styles.subject} numberOfLines={2}>{item.subject || '(No title)'}</Text>

          {!item.allDay && (!!item.location || (!!item.organizer && !isOrg)) && (
            <View style={styles.metaRow}>
              <Ionicons name={item.location ? 'location-outline' : 'person-outline'} size={12} color="rgba(255,255,255,0.55)" />
              <Text style={styles.meta} numberOfLines={1}>
                {item.location ? item.location : item.organizer}
                {!!item.location && !!item.organizer && !isOrg ? `  ·  ${item.organizer}` : ''}
              </Text>
            </View>
          )}

          {(!!item.joinUrl || (!answered && !isOrg)) && (
            <View style={styles.actions}>
              {!!item.joinUrl && (
                <Pressable style={styles.join} onPress={() => Linking.openURL(item.joinUrl)}>
                  <Ionicons name="videocam" size={14} color="#34D399" /><Text style={styles.joinText}>{joinLabel(item.joinUrl)}</Text>
                </Pressable>
              )}
              {!answered && !isOrg && (
                busyId === item.id ? <ActivityIndicator color={colors.blue} style={{ marginLeft: 8 }} /> : (
                  <View style={styles.rsvpRow}>
                    <Pressable style={[styles.rsvp, styles.accept]} onPress={() => rsvp(item, 'accept')}><Text style={styles.acceptText}>Accept</Text></Pressable>
                    <Pressable style={styles.rsvp} onPress={() => rsvp(item, 'tentative')}><Text style={styles.rsvpText}>Maybe</Text></Pressable>
                    <Pressable style={styles.rsvp} onPress={() => rsvp(item, 'decline')}><Text style={styles.rsvpText}>Decline</Text></Pressable>
                  </View>
                )
              )}
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.scrim} pointerEvents="none" />
      {renderNav()}

      {loading ? (
        <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
      ) : needsReconnect ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={40} color="rgba(255,255,255,0.5)" />
          <Text style={styles.emptyTitle}>Enable calendar access</Text>
          <Text style={styles.emptySub}>Reconnect your account once to let ScaleMail show your events and RSVP to invites.</Text>
          <Pressable style={styles.cta} onPress={() => navigate('Connect')}><Text style={styles.ctaText}>Reconnect</Text></Pressable>
        </View>
      ) : !calAccounts.length ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={40} color="rgba(255,255,255,0.5)" />
          <Text style={styles.emptyTitle}>Connect your email</Text>
          <Text style={styles.emptySub}>Connect Outlook or Gmail to see your upcoming events here.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderWeek()}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHead}>{section.title.toUpperCase()}</Text>}
          renderItem={({ item }) => renderCard(item)}
          ListEmptyComponent={renderEmpty()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,18,0.50)' },

  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },

  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 4, paddingBottom: 12 },
  dayCell: { flex: 1, alignItems: 'center' },
  dowLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { backgroundColor: colors.blue },
  dayCircleIdle: { backgroundColor: 'rgba(255,255,255,0.04)' },
  dayNum: { fontSize: 15, fontWeight: '600' },
  dayNumToday: { color: '#fff', fontWeight: '700' },
  dayNumActive: { color: '#fff' },
  dayNumIdle: { color: 'rgba(255,255,255,0.55)' },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(147,197,253,0.9)', marginTop: 6 },
  dotSpacer: { width: 5, height: 5, marginTop: 6 },

  list: { paddingHorizontal: 16, paddingBottom: 120 },
  sectionHead: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', paddingTop: 16, paddingBottom: 8, paddingHorizontal: 2 },

  card: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderTopColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  bar: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, padding: 14 },

  statusPill: { position: 'absolute', top: 10, right: 10, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  allDayPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7, marginBottom: 6 },
  allDayText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },

  time: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginBottom: 3, marginRight: 64 },
  subject: { color: '#fff', fontSize: 14, fontWeight: '700', marginRight: 64 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  meta: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, flexShrink: 1 },

  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 },
  join: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(16,185,129,0.16)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: 18, paddingVertical: 7, paddingHorizontal: 14 },
  joinText: { color: '#34D399', fontWeight: '700', fontSize: 13 },
  rsvpRow: { flexDirection: 'row', gap: 8 },
  rsvp: { borderRadius: 16, paddingVertical: 6, paddingHorizontal: 13, backgroundColor: 'rgba(255,255,255,0.12)' },
  rsvpText: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 13 },
  accept: { backgroundColor: 'rgba(16,185,129,0.16)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  acceptText: { color: '#34D399', fontWeight: '700', fontSize: 13 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 80, gap: 10 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cta: { backgroundColor: colors.blue, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
