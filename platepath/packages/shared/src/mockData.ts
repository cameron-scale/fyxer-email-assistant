import type { Owner, Vehicle, Ping, PingSource } from './types.ts';

/**
 * Deterministic demo data. No real people, plates, or vehicles. Coordinates are
 * around Austin, TX so a real basemap would render coherently, but the demo UI
 * draws its own schematic so it works fully offline.
 *
 * A tiny seeded PRNG keeps the generated drive reproducible (important for tests
 * and for a stable demo).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const OWNERS: Owner[] = [
  { id: 'own_family', displayName: 'The Rivera Family', role: 'family', email: 'parent@example.com' },
  { id: 'own_fleet', displayName: 'Lone Star HVAC', role: 'fleet', email: 'ops@example.com' },
  { id: 'own_dealer', displayName: 'Capital Auto Credit', role: 'dealer', email: 'recovery@example.com' },
  { id: 'own_agency', displayName: 'County Sheriff — Auto Theft Unit', role: 'agency', email: 'unit@example.gov' },
];

export const VEHICLES: Vehicle[] = [
  {
    id: 'veh_teen',
    ownerId: 'own_family',
    plate: 'RVR1423',
    state: 'TX',
    nickname: "Maya's Civic",
    make: 'Honda',
    model: 'Civic',
    year: 2019,
    color: 'Blue',
    deviceType: 'obd',
    verificationStatus: 'verified',
    verificationMethod: 'device_pairing',
    disclosedTo: ['Maya Rivera (driver, consented)'],
  },
  {
    id: 'veh_van',
    ownerId: 'own_fleet',
    plate: 'LSH8890',
    state: 'TX',
    nickname: 'Service Van 4',
    make: 'Ford',
    model: 'Transit',
    year: 2022,
    color: 'White',
    deviceType: 'hardwired',
    verificationStatus: 'verified',
    verificationMethod: 'fleet_admin_assignment',
    disclosedTo: ['J. Alvarez (driver, disclosed per policy)'],
  },
  {
    id: 'veh_lot',
    ownerId: 'own_dealer',
    plate: 'DLR0007',
    state: 'TX',
    nickname: 'Stock #4471 — Altima',
    make: 'Nissan',
    model: 'Altima',
    year: 2020,
    color: 'Silver',
    deviceType: 'hardwired',
    verificationStatus: 'verified',
    verificationMethod: 'lienholder_record',
  },
  {
    // Intentionally unverified to demonstrate the gate blocking a read.
    id: 'veh_unverified',
    ownerId: 'own_family',
    plate: 'ABC1234',
    state: 'CA',
    nickname: 'Unclaimed plate (demo of the block)',
    deviceType: 'phone',
    verificationStatus: 'pending',
    verificationMethod: 'registration_doc',
  },
];

interface Waypoint {
  lat: number;
  lng: number;
  /** Target speed (mph) driving toward the NEXT waypoint. */
  targetMph: number;
  /** Optional posted limit (mph) for legs approaching this point. */
  limitMph?: number;
  /** Dwell seconds at this waypoint (a stop). */
  dwellSec?: number;
  label?: string;
}

// A believable ~14-mile drive: neighborhood → arterials → I-35 (with a
// speeding stretch) → downtown. Speeds and limits chosen to exercise every
// speed band in the engine.
const DRIVE: Waypoint[] = [
  { lat: 30.2100, lng: -97.8600, targetMph: 20, limitMph: 30, label: 'Home', dwellSec: 0 },
  { lat: 30.2180, lng: -97.8480, targetMph: 34, limitMph: 35 },
  { lat: 30.2240, lng: -97.8350, targetMph: 41, limitMph: 40, dwellSec: 45, label: 'Red light' },
  { lat: 30.2360, lng: -97.8150, targetMph: 68, limitMph: 65, label: 'On-ramp I-35' },
  { lat: 30.2520, lng: -97.7930, targetMph: 82, limitMph: 65, label: 'Highway (speeding)' },
  { lat: 30.2660, lng: -97.7760, targetMph: 63, limitMph: 65 },
  { lat: 30.2720, lng: -97.7530, targetMph: 30, limitMph: 35, dwellSec: 0, label: 'Exit' },
  { lat: 30.2685, lng: -97.7420, targetMph: 18, limitMph: 25, dwellSec: 0, label: 'Downtown' },
  { lat: 30.2669, lng: -97.7390, targetMph: 0, limitMph: 25, label: 'Arrived' },
];

/**
 * Generate a stream of pings for one vehicle following DRIVE, emitting a fix
 * every `intervalSec` seconds with small positional jitter. Distances between
 * waypoints and target speeds determine timing, so the engine recovers speeds
 * close to the targets.
 */
export function generateDrive(
  vehicleId: string,
  startIso = '2026-08-09T14:02:00Z',
  intervalSec = 20,
  source: PingSource = 'obd',
  seed = 42,
): Ping[] {
  const rand = mulberry32(seed);
  const jitter = () => (rand() - 0.5) * 0.00018; // ~15m
  const pings: Ping[] = [];
  let t = Date.parse(startIso);

  const push = (lat: number, lng: number, limit?: number) => {
    const p: Ping = {
      vehicleId,
      ts: new Date(t).toISOString(),
      lat: lat + jitter(),
      lng: lng + jitter(),
      accuracyM: 6 + rand() * 8,
      source,
    };
    if (limit != null) (p as unknown as { speedLimitMph?: number }).speedLimitMph = limit;
    pings.push(p);
  };

  const EARTH = 3958.7613;
  const rad = (d: number) => (d * Math.PI) / 180;
  const legMiles = (a: Waypoint, b: Waypoint) => {
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  push(DRIVE[0].lat, DRIVE[0].lng, DRIVE[0].limitMph);

  for (let i = 0; i < DRIVE.length - 1; i++) {
    const a = DRIVE[i];
    const b = DRIVE[i + 1];
    const miles = legMiles(a, b);
    const mph = Math.max(4, a.targetMph);
    const legSec = (miles / mph) * 3600;
    const steps = Math.max(1, Math.round(legSec / intervalSec));

    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      t += (legSec / steps) * 1000;
      push(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f, b.limitMph);
    }
    if (b.dwellSec) {
      const dwellSteps = Math.round(b.dwellSec / intervalSec);
      for (let s = 0; s < dwellSteps; s++) {
        t += intervalSec * 1000;
        push(b.lat, b.lng, b.limitMph);
      }
    }
  }

  return pings;
}

/** Waypoint labels aligned to their coordinates, for annotating the demo map. */
export const DRIVE_LABELS = DRIVE.filter((w) => w.label).map((w) => ({
  lat: w.lat,
  lng: w.lng,
  label: w.label as string,
}));

/** Convenience: the canonical demo track pings for the verified teen vehicle. */
export function demoPings(): Ping[] {
  return generateDrive('veh_teen');
}
