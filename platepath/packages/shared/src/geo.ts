/**
 * Geospatial primitives used by the track engine.
 *
 * All distances are returned in statute miles and all speeds in miles per hour,
 * to match US-market conventions (the product is USA-only, all 50 states).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean Earth radius in statute miles. */
export const EARTH_RADIUS_MI = 3958.7613;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Great-circle distance between two coordinates, in statute miles.
 * Uses the haversine formula, which is numerically stable for the short
 * distances between consecutive GPS pings.
 */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial bearing (forward azimuth) from `a` to `b`, in degrees clockwise
 * from true north (0–360).
 */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Speed in mph given a distance in miles and a duration in seconds. */
export function speedMph(distanceMi: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return distanceMi / (durationSec / 3600);
}

/** Compass label (N, NE, E, …) for a bearing in degrees. Handy for UI. */
export function compass(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(bearing / 45) % 8];
}
