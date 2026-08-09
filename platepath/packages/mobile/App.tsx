import { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { timeCode } from '@platepath/shared';
import type { Owner, Track } from '@platepath/shared';
import { api, type VehicleWithGate } from './src/api.ts';
import { TrackMap } from './src/TrackMap.tsx';

export function App() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [vehicles, setVehicles] = useState<VehicleWithGate[]>([]);
  const [track, setTrack] = useState<Track | null>(null);
  const [blocked, setBlocked] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.owners().then((o) => {
      setOwners(o);
      setOwnerId(o[0]?.id ?? '');
    });
  }, []);

  useEffect(() => {
    if (ownerId) api.vehicles(ownerId).then(setVehicles);
    setTrack(null);
  }, [ownerId]);

  async function open(id: string) {
    setLoading(true);
    setBlocked('');
    setTrack(null);
    try {
      const { track } = await api.track(id, ownerId);
      setTrack(track);
    } catch (e) {
      setBlocked((e as { body?: { message?: string } }).body?.message ?? 'Access blocked.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.brand}>PlatePath</Text>
        <Text style={s.sub}>Consent-based route intelligence</Text>

        <View style={s.owners}>
          {owners.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => setOwnerId(o.id)}
              style={[s.chip, ownerId === o.id && s.chipActive]}
            >
              <Text style={s.chipText}>{o.role}</Text>
            </Pressable>
          ))}
        </View>

        {vehicles.map((v) => (
          <Pressable key={v.id} style={s.card} onPress={() => open(v.id)}>
            <View style={s.rowBetween}>
              <Text style={s.plate}>{v.plate} · {v.state}</Text>
              <Text style={[s.badge, v.trackable ? s.badgeOk : s.badgeLocked]}>
                {v.trackable ? 'Verified' : v.verificationStatus}
              </Text>
            </View>
            <Text style={s.muted}>{v.nickname}</Text>
            {!v.trackable && <Text style={s.locked}>🔒 Locked — {v.reason}</Text>}
          </Pressable>
        ))}

        {loading && <ActivityIndicator color="#22d3ee" style={{ marginTop: 20 }} />}

        {blocked ? (
          <View style={s.blocked}>
            <Text style={s.blockedTitle}>🔒 Location history is locked</Text>
            <Text style={s.muted}>{blocked}</Text>
          </View>
        ) : null}

        {track && (
          <View style={{ marginTop: 16 }}>
            <View style={s.statsRow}>
              <Stat label="Distance" value={`${track.totals.distanceMi} mi`} />
              <Stat label="Avg" value={`${track.totals.avgSpeedMph} mph`} />
              <Stat label="Top" value={`${track.totals.maxSpeedMph} mph`} />
              <Stat label="Speeding" value={`${track.totals.speedingSegments}`} />
            </View>
            <TrackMap track={track} />
            <Text style={s.h2}>Segments</Text>
            {track.segments
              .filter((seg) => !seg.isGap)
              .slice(0, 40)
              .map((seg) => (
                <View key={seg.index} style={s.seg}>
                  <Text style={s.segT}>t+{timeCode(track, seg.to)}</Text>
                  <Text style={[s.segSpeed, seg.isSpeeding && s.over]}>{seg.speedMph} mph</Text>
                  <Text style={s.muted}>limit {seg.speedLimitMph ?? '—'}</Text>
                </View>
              ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060910' },
  scroll: { padding: 16 },
  brand: { color: '#e2e8f0', fontSize: 28, fontWeight: '800' },
  sub: { color: '#94a3b8', marginBottom: 16 },
  owners: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b' },
  chipActive: { borderColor: '#22d3ee' },
  chipText: { color: '#e2e8f0', textTransform: 'capitalize' },
  card: { backgroundColor: '#0f172a', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', padding: 14, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plate: { color: '#e2e8f0', fontWeight: '700', letterSpacing: 1 },
  muted: { color: '#94a3b8', fontSize: 13 },
  locked: { color: '#f87171', fontSize: 12, marginTop: 6 },
  badge: { fontSize: 11, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden' },
  badgeOk: { backgroundColor: 'rgba(34,197,94,.15)', color: '#4ade80' },
  badgeLocked: { backgroundColor: 'rgba(248,113,113,.15)', color: '#f87171' },
  blocked: { backgroundColor: 'rgba(248,113,113,.08)', borderColor: 'rgba(248,113,113,.3)', borderWidth: 1, padding: 16, borderRadius: 12, marginTop: 12 },
  blockedTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, borderRadius: 10, padding: 10 },
  statValue: { color: '#e2e8f0', fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#94a3b8', fontSize: 11 },
  h2: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginVertical: 10 },
  seg: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopColor: '#1e293b', borderTopWidth: 1 },
  segT: { color: '#94a3b8' },
  segSpeed: { color: '#e2e8f0', fontWeight: '600' },
  over: { color: '#f87171' },
});
