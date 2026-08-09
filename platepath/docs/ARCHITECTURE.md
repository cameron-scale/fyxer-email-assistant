# PlatePath — Technical Architecture

## The core reframe (why this design exists)

The original brief was: *"use public traffic cameras to find any registered
license plate, trace its path, and show its speed."* Two independent walls make
that literal product impossible to ship (see [`LEGAL.md`](./LEGAL.md) and the
feasibility findings):

1. **Public traffic cameras cannot do this.** DOT/511 traffic cameras are
   low-resolution, wide-angle, refresh on the order of seconds-to-minutes, are
   overwhelmingly *not* recorded, and are not built to resolve plates. There is
   no nationwide public feed or API to run recognition against. You cannot
   "scan the country's traffic cams for a plate."
2. **Tracking a plate you merely *typed in* is stalking.** Registering a plate
   in an app is not proof you own the car, and owning the car is not the driver's
   consent. A "register the plate" box does not stop abuse — anyone can type an
   ex-partner's plate. Apple and Google both ban covert-tracking apps outright.

So PlatePath keeps the founder's actual goal — **know where your vehicle is,
its route with time codes, and its speed in each section** — and builds it on
the only foundation that is both technically real and legal: **consent-based
telematics on vehicles whose ownership/authority you have verified.**

## System overview

```
                    ┌──────────────────────────────────────────────┐
   Data sources     │                 Ingestion                    │
   ─────────────    │                                              │
   OBD-II dongle ──►│  POST /api/ingest  (batched, signed)         │
   Hardwired GPS ──►│        │                                     │
   Phone SDK     ──►│        ▼                                     │
   Asset tag     ──►│   pings table (append-only, partitioned)     │
   Licensed ALPR ─► │   [recovery/LE tier only, contract-gated]    │
                    └────────┬─────────────────────────────────────┘
                             │
              ┌──────────────▼───────────────┐     ┌──────────────────────┐
              │        Track Engine          │     │     Consent Gate      │
              │ buildTrack(pings) →          │◄────│ assertCanTrack()      │
              │  segments{dist,dur,speed,    │     │  • owner match        │
              │  heading,isSpeeding,gap}     │     │  • verified ownership │
              │  + totals + trip splitting   │     │  • driver disclosure  │
              └──────────────┬───────────────┘     └──────────┬───────────┘
                             │                                 │
                             ▼                                 ▼
              ┌──────────────────────────────┐     ┌──────────────────────┐
              │  Web app (React + Vite)      │     │  Immutable audit log  │
              │  iOS/Android (Expo + RN)     │     │  every read recorded  │
              │  Route on map, speed/segment,│     └──────────────────────┘
              │  time codes, alerts          │
              └──────────────────────────────┘
```

## Monorepo layout

| Package | What it is | Runs today |
|---|---|---|
| `packages/shared` | Domain core: geo math, **track/speed engine**, **consent gate**, pricing & 3-yr projection model, demo data. Pure TypeScript, no deps. | ✅ `npm test` (32 assertions) |
| `packages/api` | Reference API. Zero-dependency Node `http` server; every location read passes the consent gate and is audited. | ✅ `npm run api` |
| `packages/web` | React + Vite web app: vehicle list with the gate, route map (speed-colored), segment table with time codes, totals. | source (needs `npm i`) |
| `packages/mobile` | Expo + React Native iPhone/Android app; Google Maps polylines colored per segment; `expo-location` for consented driver sharing. | source (needs Expo) |

Everything shares one engine — the web app, the iOS app, and the API all import
`@platepath/shared`, so the number you see on a phone is the same number the API
computed.

## The track engine (`packages/shared/src/trackEngine.ts`)

`buildTrack(vehicleId, pings, opts)` is a **pure, deterministic** function that
turns a raw ping stream into a drawable, analyzable route:

1. **Clean** — filter to the vehicle, drop low-accuracy fixes (>100 m), sort by
   time, discard duplicate/out-of-order timestamps.
2. **Segment** — for each consecutive pair compute haversine distance, elapsed
   time, **average speed = distance / time**, and heading (bearing).
3. **Speed limits & speeding** — each leg carries a posted limit (per-ping hint,
   or a production speed-limit tile lookup); a leg is flagged when it exceeds the
   limit by more than the margin (default 5 mph).
4. **Trip breaks** — gaps longer than the threshold (default 5 min) are marked
   `isGap` so the map does not draw a straight line across a parking gap, tunnel,
   or signal loss; `splitTrips()` turns a day into discrete trips.
5. **Outlier rejection** — legs implying > 130 mph are treated as GPS error and
   excluded from distance and top-speed stats.
6. **Roll-up** — total distance, moving time, average and **max** speed, stop
   count, and speeding-leg count.

Helpers: `speedBand()` (map color per leg), `timeCode()` (elapsed `h:mm:ss` per
point — the "time codes" from the brief), `splitTrips()`.

Why geometry-derived speed instead of the device's reported speed? It is
tamper-resistant and consistent across device types; the sensor value is used
only as a fallback when two pings are effectively co-located (parked).

## The consent gate (`packages/shared/src/consent.ts`)

The single choke point every read path must call. There is **no code path** that
returns a location for an unverified vehicle. Two independent requirements:

- **Proof of control** — one of: device pairing (a tracker we can see reporting
  from the vehicle), reviewed registration/title, dealer/lender lienholder
  record, fleet-admin assignment, or LE lawful-process attestation. Typing a
  plate never verifies.
- **Disclosure** — for family/fleet vehicles driven by others, a recorded
  disclosure/consent entry is required before tracking turns on.

`beginClaim()` enforces one-owner-per-plate (a second claimant hits a dispute
review, not a silent grant) and role/method rules (a *family* account cannot use
the *LE legal-process* method). It never returns `verified` synchronously —
verification always needs an out-of-band proof, which is what defeats casual
abuse.

## Mapping

`packages/shared/src/viewport.ts` provides a tile-free equirectangular
projection (latitude-corrected) so the route renders as an SVG polyline with no
Maps API key — used by the web app and the offline demo. Production overlays the
identical segment geometry on **Google Maps** (`Polyline` per segment on the JS
SDK for web, `react-native-maps` with `PROVIDER_GOOGLE` on mobile), satisfying
the brief's "on Google Maps" requirement while the SVG path guarantees the app
still works if the key/tiles are unavailable.

## Data model (production)

- **Postgres + PostGIS**: `owners`, `vehicles`, `claims`, `disclosures`,
  `pings` (append-only, day-partitioned, geography column), `access_audit`
  (append-only, tamper-evident).
- **Redis**: live "last known location" per vehicle, geofence state.
- **Object storage**: uploaded registration/title docs for verification review
  (encrypted, short-retention).
- **Retention controls**: per-jurisdiction retention windows are configurable
  because several states cap how long plate/location data may be held.

## Running locally

```bash
cd platepath
npm test            # 32 engine/consent/pricing assertions, zero installs
npm run api         # reference API on :8787 (zero installs)
npm run projections # print 3-yr projection scenarios

# full apps (need installs):
npm install
npm run dev -w @platepath/web        # web on :5173, proxies /api → :8787
npm start  -w @platepath/mobile      # Expo (iPhone via Expo Go / simulator)
```

Requires Node ≥ 22.6 (uses native TypeScript execution via
`--experimental-strip-types`).
