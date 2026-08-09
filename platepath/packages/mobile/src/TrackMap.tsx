import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { StyleSheet } from 'react-native';
import { speedBand } from '@platepath/shared';
import type { Track } from '@platepath/shared';

const BAND_COLOR = {
  gap: '#00000000',
  stopped: '#64748b',
  ok: '#16a34a',
  warn: '#f59e0b',
  over: '#dc2626',
} as const;

/**
 * Draws the traced route on Google Maps as one Polyline per segment, colored by
 * how far over the limit the vehicle was — the native counterpart to the web
 * app's SVG RouteMap.
 */
export function TrackMap({ track }: { track: Track }) {
  const pts = track.pings.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  if (pts.length === 0) return null;

  const lats = pts.map((p) => p.latitude);
  const lngs = pts.map((p) => p.longitude);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: (Math.max(...lats) - Math.min(...lats)) * 1.4 + 0.01,
    longitudeDelta: (Math.max(...lngs) - Math.min(...lngs)) * 1.4 + 0.01,
  };

  return (
    <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={region}>
      {track.segments
        .filter((s) => !s.isGap)
        .map((s) => (
          <Polyline
            key={s.index}
            coordinates={[
              { latitude: s.from.lat, longitude: s.from.lng },
              { latitude: s.to.lat, longitude: s.to.lng },
            ]}
            strokeColor={BAND_COLOR[speedBand(s)]}
            strokeWidth={5}
          />
        ))}
      <Marker coordinate={pts[0]} title="Start" pinColor="#22d3ee" />
      <Marker coordinate={pts[pts.length - 1]} title="End" pinColor="#a78bfa" />
    </MapView>
  );
}

const styles = StyleSheet.create({ map: { width: '100%', height: 320, borderRadius: 12 } });
