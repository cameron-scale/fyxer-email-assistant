import { haversineMiles, type LatLng } from './geo.ts';
import { timeCode } from './trackEngine.ts';
import { normalizePlate } from './consent.ts';
import type { Track } from './types.ts';

/**
 * CHECKPOINT DETECTION
 * --------------------
 * A "checkpoint" is a camera the customer (or, on the agency tier, an authority
 * under lawful process) operates — a dealer lot gate, a fleet yard, a depot, a
 * lawful ALPR site. At each one the system boxes every vehicle it sees, but it
 * reads out the plate ONLY for vehicles registered & verified to the account.
 *
 * That gate — `identifyDetections()` — is the whole legal difference between
 * this and illegal mass plate-scraping: reading every stranger's plate off a
 * public road is the stalkerware/DPPA problem (see docs/LEGAL.md); identifying
 * *your own* verified vehicle at a checkpoint is lawful and looks identical for
 * the car you're allowed to see.
 */

export interface Waypoint extends LatLng {
  label: string;
}

export interface Checkpoint {
  label: string;
  /** ISO timestamp of the nearest ping to this waypoint. */
  ts: string;
  /** Elapsed "time code" (h:mm:ss) from the start of the track. */
  timeCode: string;
  lat: number;
  lng: number;
  /** Speed on the segment arriving at this checkpoint (mph). */
  speedMph: number;
  speedLimitMph?: number;
  isSpeeding: boolean;
  /** Index of the arriving segment. */
  segmentIndex: number;
}

/**
 * Turn labeled waypoints into checkpoints by snapping each to the nearest ping
 * and reading the arriving segment's speed/limit + a trip-relative time code.
 */
export function buildCheckpoints(track: Track, waypoints: Waypoint[]): Checkpoint[] {
  return waypoints.map((w) => {
    let bestI = 0;
    let bestD = Infinity;
    track.pings.forEach((p, i) => {
      const d = haversineMiles(p, w);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    const ping = track.pings[bestI];
    const segIndex = Math.min(track.segments.length - 1, Math.max(0, bestI - 1));
    const seg = track.segments[segIndex];
    return {
      label: w.label,
      ts: ping?.ts ?? '',
      timeCode: ping ? timeCode(track, ping) : '0:00',
      lat: w.lat,
      lng: w.lng,
      speedMph: seg ? seg.speedMph : 0,
      speedLimitMph: seg?.speedLimitMph,
      isSpeeding: seg ? seg.isSpeeding : false,
      segmentIndex: segIndex,
    };
  });
}

export interface Detection {
  /** The plate string if this vehicle is identified; null if it stays anonymous. */
  plate: string | null;
  /** True only when the detected plate is registered & verified to this account. */
  identified: boolean;
  speedMph: number;
}

/**
 * THE CHECKPOINT GATE. Given the plates a camera detected and the set of plates
 * the account has verified, return an identification result per detection:
 * registered plates are read out; everyone else is boxed but anonymized. There
 * is no path here that returns a plate string for an unregistered vehicle.
 */
export function identifyDetections(
  detected: { plate: string; speedMph: number }[],
  registeredPlates: Iterable<string>,
): Detection[] {
  const allow = new Set<string>();
  for (const p of registeredPlates) allow.add(normalizePlate(p));
  return detected.map((d) => {
    const identified = allow.has(normalizePlate(d.plate));
    return {
      plate: identified ? d.plate : null,
      identified,
      speedMph: d.speedMph,
    };
  });
}
