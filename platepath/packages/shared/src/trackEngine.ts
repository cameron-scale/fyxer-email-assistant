import { haversineMiles, bearingDeg, speedMph as calcSpeed } from './geo.ts';
import type {
  Ping,
  Segment,
  Track,
  TrackTotals,
  BuildTrackOptions,
} from './types.ts';

const DEFAULTS: Required<
  Omit<BuildTrackOptions, 'defaultSpeedLimitMph'>
> & { defaultSpeedLimitMph?: number } = {
  tripBreakSec: 300,
  maxPlausibleMph: 130,
  maxAccuracyM: 100,
  speedingMarginMph: 5,
  stopSpeedMph: 1.5,
  defaultSpeedLimitMph: undefined,
};

/**
 * Turn a raw stream of pings into a clean, drawable Track: an ordered set of
 * segments each carrying distance, duration, average speed, heading, and a
 * speeding flag, plus rolled-up totals. This is the core of the product — the
 * "trace their path with time codes and per-section speed" feature.
 *
 * The function is pure and deterministic: same pings in, same track out.
 */
export function buildTrack(
  vehicleId: string,
  rawPings: Ping[],
  options: BuildTrackOptions = {},
): Track {
  const opt = { ...DEFAULTS, ...options };

  // 1. Keep only this vehicle's pings, drop low-accuracy fixes, sort by time.
  const pings = rawPings
    .filter((p) => p.vehicleId === vehicleId)
    .filter((p) => p.accuracyM == null || p.accuracyM <= opt.maxAccuracyM)
    .slice()
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  const segments: Segment[] = [];
  let maxSpeedMph = 0;
  let movingDurationSec = 0;
  let distanceMi = 0;
  let speedingSegments = 0;
  let stops = 0;

  for (let i = 1; i < pings.length; i++) {
    const from = pings[i - 1];
    const to = pings[i];
    const durationSec = (Date.parse(to.ts) - Date.parse(from.ts)) / 1000;
    if (durationSec <= 0) continue; // duplicate / out-of-order timestamp

    const legMi = haversineMiles(from, to);
    const isGap = durationSec > opt.tripBreakSec;

    // Prefer the average speed derived from geometry; fall back to the sensor
    // value only when the two pings are effectively co-located (parked).
    let legSpeed = calcSpeed(legMi, durationSec);
    if (legMi < 0.003 && to.speedMph != null) legSpeed = to.speedMph;

    const plausible = legSpeed <= opt.maxPlausibleMph;

    const limit = resolveLimit(to, opt.defaultSpeedLimitMph);
    const isSpeeding =
      plausible &&
      limit != null &&
      legSpeed > limit + opt.speedingMarginMph;

    const seg: Segment = {
      index: i - 1,
      from,
      to,
      distanceMi: legMi,
      durationSec,
      speedMph: round(legSpeed, 1),
      headingDeg: round(bearingDeg(from, to), 0),
      isSpeeding,
      speedLimitMph: limit,
      isGap,
    };
    segments.push(seg);

    // Only accumulate stats for real movement legs (not trip-break gaps).
    if (!isGap) {
      if (plausible) {
        distanceMi += legMi;
        movingDurationSec += durationSec;
        if (legSpeed > maxSpeedMph) maxSpeedMph = legSpeed;
      }
      if (isSpeeding) speedingSegments++;
      if (legSpeed < opt.stopSpeedMph) stops++;
    }
  }

  const elapsedDurationSec =
    pings.length >= 2
      ? (Date.parse(pings[pings.length - 1].ts) - Date.parse(pings[0].ts)) / 1000
      : 0;

  const totals: TrackTotals = {
    distanceMi: round(distanceMi, 2),
    movingDurationSec: Math.round(movingDurationSec),
    elapsedDurationSec: Math.round(elapsedDurationSec),
    avgSpeedMph: round(calcSpeed(distanceMi, movingDurationSec), 1),
    maxSpeedMph: round(maxSpeedMph, 1),
    stops,
    speedingSegments,
  };

  return {
    vehicleId,
    startTs: pings[0]?.ts ?? '',
    endTs: pings[pings.length - 1]?.ts ?? '',
    pings,
    segments,
    totals,
  };
}

function resolveLimit(
  ping: Ping,
  fallback: number | undefined,
): number | undefined {
  // A production system enriches each leg with a posted-limit lookup
  // (e.g. HERE/TomTom speed-limit tiles). Here we accept a per-ping hint or a
  // configured default; the plumbing is identical.
  const hinted = (ping as unknown as { speedLimitMph?: number }).speedLimitMph;
  return hinted ?? fallback;
}

/**
 * Map a segment speed to a color band for the map overlay.
 * Green = at/under limit, amber = mild, red = well over.
 */
export function speedBand(
  seg: Segment,
): 'gap' | 'stopped' | 'ok' | 'warn' | 'over' {
  if (seg.isGap) return 'gap';
  if (seg.speedMph < 1.5) return 'stopped';
  if (seg.speedLimitMph == null) return 'ok';
  const over = seg.speedMph - seg.speedLimitMph;
  if (over <= 5) return 'ok';
  if (over <= 12) return 'warn';
  return 'over';
}

/** Elapsed "time code" (h:mm:ss from trip start) for a ping. */
export function timeCode(track: Track, ping: Ping): string {
  const start = Date.parse(track.startTs);
  const s = Math.max(0, Math.round((Date.parse(ping.ts) - start) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Split a track's segments into discrete trips, breaking wherever a gap
 * segment appears. Useful for the "trips" list in the UI.
 */
export function splitTrips(track: Track): Segment[][] {
  const trips: Segment[][] = [];
  let current: Segment[] = [];
  for (const seg of track.segments) {
    if (seg.isGap && current.length) {
      trips.push(current);
      current = [];
    } else if (!seg.isGap) {
      current.push(seg);
    }
  }
  if (current.length) trips.push(current);
  return trips;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
