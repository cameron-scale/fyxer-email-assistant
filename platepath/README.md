# PlatePath

**Consent-based vehicle route intelligence — for families, fleets, dealers, and law enforcement. USA, all 50 states.**

Trace a vehicle you own, see its route with time codes, and read its speed in
every section — on a map, on the web and on iPhone. PlatePath only works on
vehicles whose ownership you have **verified**, from **consented telematics** —
never by scanning strangers' plates.

---

## Read this first: what changed from the original idea, and why

The original brief was: *"use public traffic cameras to find any registered
license plate, trace its path on Google Maps with time codes, and show its speed
per section — for parents, fleets, dealers, and police."*

I researched this hard (federal + 50-state law, app-store policy, and the actual
capability of traffic cameras). **The literal version cannot be built or sold.**
Two independent walls:

1. **Public traffic cameras cannot do this — technically.** DOT / 511 traffic
   cameras are low-resolution, wide-angle, refresh every several seconds to
   minutes, are overwhelmingly *not recorded*, and are not built or positioned to
   read plates. There is **no nationwide public feed or API** to run plate
   recognition against. "Scan the country's traffic cams for a plate" is not a
   thing that exists. Purpose-built plate-reader (ALPR) networks *do* exist —
   Flock, Motorola/Vigilant/DRN, Rekor — but they are private/LE-restricted, not
   public, and access is contractual and use-case-gated.

2. **Tracking a plate you merely typed in is stalking — legally.** Registering a
   plate in an app is **not proof you own the car**, and owning the car is **not
   the driver's consent**. A "register the plate" box does not stop abuse; anyone
   can type an ex-partner's plate. Persistent location tracking of a person is
   governed by a thicket of law (DPPA for plate→owner data, state anti-tracking
   and ALPR statutes, FTC Section 5, civil stalking/intrusion torts), and **Apple
   and Google both ban covert-tracking apps outright** — this design would be
   rejected from the App Store.

So PlatePath keeps your **actual goal** — *know where your vehicle is, its route
with time codes, and its speed in each section* — and builds it on the only
foundation that is both real and legal: **consent-based telematics on vehicles
whose ownership/authority you have verified.** Same four customers, a product
that ships, an App Store approval, and a defensible business.

> Full detail: **[docs/LEGAL.md](./docs/LEGAL.md)** (legality + compliance
> design) and **[docs/STRATEGY.md](./docs/STRATEGY.md)** (need, market, pricing,
> 3-year projections).

## What it does

- **Register & verify a vehicle** — prove control via a paired tracker, a
  reviewed registration/title, a dealer/lender lienholder record, a fleet-admin
  assignment, or (agency tier) lawful process. Typing a plate never verifies.
- **Trace the route** — every trip drawn on the map, colored by speed, with time
  codes at each point.
- **Speed per section** — average speed for each leg, flagged against the posted
  limit; top speed, distance, moving time, stop and speeding-leg counts.
- **The anti-stalking gate** — there is no code path that returns a location for
  an unverified vehicle. Try it in the demo.
- **Alerts** — geofences, speeding, and (family) late-night driving.

## Try it in 30 seconds (no installs)

Requires **Node ≥ 22.6** (PlatePath runs TypeScript natively).

```bash
cd platepath

npm test            # 32 assertions: engine + consent gate + projections
npm run api         # reference API on http://localhost:8787
npm run projections # print the 3-year projection scenarios
```

Then, with the API running:

```bash
curl "localhost:8787/api/vehicles/veh_teen/track?ownerId=own_family"    # 200 + traced route
curl "localhost:8787/api/vehicles/veh_unverified/track?ownerId=own_family"  # 403: consent gate blocks it
```

**Interactive demo:** open [`demo/index.html`](./demo/index.html) in a browser —
switch accounts, trace a vehicle, press *Play* to watch the route draw with a
live time code + speed readout, and open the unverified plate to see the gate.

## The apps

```bash
npm install                         # links workspaces + app deps
npm run dev  -w @platepath/web      # web app on :5173 (proxies /api → :8787)
npm start    -w @platepath/mobile   # Expo — run on iPhone via Expo Go / simulator
```

The web app and the iPhone app import the **same** engine as the API
(`@platepath/shared`), so a number shown on a phone is the number the server
computed. Maps use **Google Maps** in production (JS SDK on web, `react-native-maps`
with `PROVIDER_GOOGLE` on iOS); a tile-free SVG renderer is the offline fallback.

## Repository

```
platepath/
├── README.md
├── demo/index.html               # self-contained interactive console (shareable)
├── docs/
│   ├── ARCHITECTURE.md           # system design, engine, consent gate
│   ├── LEGAL.md                  # legality research + compliance design (50 states)
│   └── STRATEGY.md               # market need, pricing, 3-year projections
└── packages/
    ├── shared/                   # geo, track/speed engine, consent, pricing — tested
    ├── api/                      # zero-dependency reference API
    ├── web/                      # React + Vite web app
    └── mobile/                   # Expo + React Native iPhone/Android app
```

## Status

This is a working reference implementation and business case, not a launched
product. The engine, consent gate, projection model, API, and demo run and are
tested; the web and mobile apps are complete source that build with `npm install`.
Production hardening (Postgres/PostGIS, auth, device provisioning, real
speed-limit tiles, SOC 2, the verification review pipeline) is scoped in
`docs/ARCHITECTURE.md` and `docs/STRATEGY.md`.
