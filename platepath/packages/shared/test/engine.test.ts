/**
 * Zero-dependency test runner. Run with:
 *   node --experimental-strip-types packages/shared/test/engine.test.ts
 *
 * Exits non-zero on the first failure so it can gate CI.
 */
import { haversineMiles, bearingDeg } from '../src/geo.ts';
import { buildTrack, splitTrips, speedBand, timeCode } from '../src/trackEngine.ts';
import { buildCheckpoints, identifyDetections } from '../src/checkpoints.ts';
import { DRIVE_LABELS } from '../src/mockData.ts';
import {
  beginClaim,
  assertCanTrack,
  canTrack,
  ConsentError,
  normalizePlate,
} from '../src/consent.ts';
import { projectRevenue, unitEconomics, DEFAULT_ASSUMPTIONS } from '../src/pricing.ts';
import { OWNERS, VEHICLES, generateDrive, demoPings } from '../src/mockData.ts';
import type { Ping } from '../src/types.ts';

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, extra ?? '');
  }
}
const approx = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

console.log('geo');
{
  // NYC → LA is ~2450 mi; allow generous tolerance.
  const d = haversineMiles({ lat: 40.7128, lng: -74.006 }, { lat: 34.0522, lng: -118.2437 });
  ok('haversine NYC→LA ~2451mi', approx(d, 2451, 40), d);
  ok('haversine zero distance', haversineMiles({ lat: 30, lng: -97 }, { lat: 30, lng: -97 }) === 0);
  ok('bearing due east ~90°', approx(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 90, 0.5));
  ok('bearing due north ~0°', approx(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), 0, 0.5));
}

console.log('trackEngine — synthetic exact-speed leg');
{
  // Two points 1 mile apart in longitude at the equator, 60s apart → 60 mph.
  const oneMileLng = 1 / 69.1712; // ~miles per degree lng at equator
  const pings: Ping[] = [
    { vehicleId: 'v', ts: '2026-01-01T00:00:00Z', lat: 0, lng: 0, source: 'gps' as never },
    { vehicleId: 'v', ts: '2026-01-01T00:01:00Z', lat: 0, lng: oneMileLng, source: 'gps' as never },
  ];
  const t = buildTrack('v', pings);
  ok('one segment produced', t.segments.length === 1, t.segments.length);
  ok('segment speed ~60mph', approx(t.segments[0].speedMph, 60, 0.5), t.segments[0].speedMph);
  ok('distance ~1mi', approx(t.totals.distanceMi, 1, 0.02), t.totals.distanceMi);
}

console.log('trackEngine — demo drive');
{
  const pings = demoPings();
  const t = buildTrack('veh_teen', pings, { speedingMarginMph: 5 });
  ok('demo produces many segments', t.segments.length > 30, t.segments.length);
  ok('total distance 8–18mi', t.totals.distanceMi > 8 && t.totals.distanceMi < 18, t.totals.distanceMi);
  ok('max speed 75–90mph (highway stretch)', t.totals.maxSpeedMph > 75 && t.totals.maxSpeedMph < 90, t.totals.maxSpeedMph);
  ok('detects speeding segments', t.totals.speedingSegments > 0, t.totals.speedingSegments);
  ok('has an "over" speed band somewhere', t.segments.some((s) => speedBand(s) === 'over'));
  ok('timecode starts at 0:00', timeCode(t, t.pings[0]) === '0:00', timeCode(t, t.pings[0]));
  const last = timeCode(t, t.pings[t.pings.length - 1]);
  ok('final timecode is later than start', last !== '0:00', last);
}

console.log('trackEngine — gap / trip splitting & outlier rejection');
{
  const base = Date.parse('2026-01-01T00:00:00Z');
  const at = (min: number, lat: number, lng: number): Ping => ({
    vehicleId: 'v',
    ts: new Date(base + min * 60000).toISOString(),
    lat,
    lng,
    source: 'gps' as never,
  });
  // trip 1, 30-min gap, trip 2, then a teleport (outlier).
  const pings: Ping[] = [
    at(0, 30.0, -97.0),
    at(2, 30.01, -97.0),
    at(40, 30.5, -97.0), // 38 min gap → trip break
    at(42, 30.51, -97.0),
    at(42.01, 45.0, -97.0), // teleport in 0.6s → implausible, excluded from max
  ];
  const t = buildTrack('v', pings, { tripBreakSec: 300, maxPlausibleMph: 130 });
  ok('two trips detected', splitTrips(t).length === 2, splitTrips(t).length);
  ok('a gap segment exists', t.segments.some((s) => s.isGap));
  ok('implausible teleport not counted in maxSpeed', t.totals.maxSpeedMph < 130, t.totals.maxSpeedMph);
}

console.log('checkpoints & the identification gate');
{
  const t = buildTrack('veh_teen', demoPings());
  const cps = buildCheckpoints(t, DRIVE_LABELS);
  ok('a checkpoint per labeled waypoint', cps.length === DRIVE_LABELS.length, cps.length);
  ok('checkpoints carry a time code', cps.every((c) => typeof c.timeCode === 'string' && c.timeCode.length > 0));
  ok('checkpoints carry a speed', cps.every((c) => typeof c.speedMph === 'number'));
  ok('at least one checkpoint is on a speeding segment', cps.some((c) => c.isSpeeding));

  // The gate: only the registered plate is read out; everyone else is anonymized.
  const detected = [
    { plate: 'RVR1423', speedMph: 41 }, // registered
    { plate: 'XYZ9999', speedMph: 67 }, // stranger
    { plate: 'foo-123', speedMph: 55 }, // stranger, punctuation
  ];
  const results = identifyDetections(detected, ['rvr 1423']); // registered set, messy formatting
  ok('registered plate is identified', results[0].identified && results[0].plate === 'RVR1423');
  ok('stranger #1 is anonymized (no plate returned)', !results[1].identified && results[1].plate === null);
  ok('stranger #2 is anonymized (no plate returned)', !results[2].identified && results[2].plate === null);
  ok('anonymized detections still carry speed', results[1].speedMph === 67);
  ok('exactly one identified of three detected', results.filter((r) => r.identified).length === 1);
}

console.log('consent gate');
{
  const family = OWNERS.find((o) => o.role === 'family')!;
  const verified = VEHICLES.find((v) => v.id === 'veh_teen')!;
  const unverified = VEHICLES.find((v) => v.id === 'veh_unverified')!;

  ok('verified vehicle is trackable', canTrack(verified, family));
  ok('unverified vehicle is NOT trackable', !canTrack(unverified, family));

  let threw = false;
  try {
    assertCanTrack(unverified, family);
  } catch (e) {
    threw = e instanceof ConsentError && e.code === 'NOT_VERIFIED';
  }
  ok('assertCanTrack throws NOT_VERIFIED', threw);

  // Cannot read another owner's vehicle.
  const dealer = OWNERS.find((o) => o.role === 'dealer')!;
  ok('cross-owner read blocked', !canTrack(verified, dealer));

  // Second claimant on an already-claimed plate is blocked (anti-stalker core).
  let blocked = false;
  try {
    beginClaim(
      { owner: { id: 'own_stranger', displayName: 'Stranger', role: 'family', email: 's@x.com' }, plate: 'RVR1423', state: 'TX', method: 'registration_doc' },
      VEHICLES.map((v) => ({ plate: v.plate, state: v.state, ownerId: v.ownerId })),
    );
  } catch (e) {
    blocked = e instanceof ConsentError && e.code === 'PLATE_ALREADY_CLAIMED';
  }
  ok('claiming an already-verified plate is blocked', blocked);

  // Role/method mismatch is rejected.
  let mismatch = false;
  try {
    beginClaim(
      { owner: OWNERS.find((o) => o.role === 'family')!, plate: 'NEW9999', state: 'TX', method: 'le_legal_process' },
      [],
    );
  } catch (e) {
    mismatch = e instanceof ConsentError && e.code === 'ROLE_METHOD_MISMATCH';
  }
  ok('family cannot use LE legal-process method', mismatch);

  // A brand-new claim returns pending (never synchronously verified).
  const claim = beginClaim(
    { owner: family, plate: 'brand-new-9', state: 'TX', method: 'device_pairing' },
    [],
  );
  ok('new claim is pending, not verified', claim.status === 'pending');
  ok('normalizePlate strips punctuation', normalizePlate('ab c-123') === 'ABC123');
}

console.log('pricing & projections');
{
  const p = projectRevenue(DEFAULT_ASSUMPTIONS, 36);
  ok('36 monthly rows', p.months.length === 36);
  ok('active units grow over time', p.summary.endingActiveUnits > DEFAULT_ASSUMPTIONS.reduce((s, a) => s + a.startingUnits, 0));
  ok('year3 revenue > year1 revenue', p.summary.year3Revenue > p.summary.year1Revenue, [p.summary.year1Revenue, p.summary.year3Revenue]);
  ok('gross margin plausible (50–95%)', p.summary.grossMarginPct > 50 && p.summary.grossMarginPct < 95, p.summary.grossMarginPct);
  ok('MRR is positive at month 36', p.summary.endingMrr > 0, p.summary.endingMrr);

  const fleet = DEFAULT_ASSUMPTIONS.find((a) => a.segment === 'fleet')!;
  const ue = unitEconomics(fleet);
  ok('fleet LTV:CAC > 3 (healthy)', ue.ratio > 3, ue);
}

console.log('mock drive determinism');
{
  const a = generateDrive('veh_teen');
  const b = generateDrive('veh_teen');
  ok('generateDrive is deterministic', JSON.stringify(a) === JSON.stringify(b));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
