/**
 * PlatePath reference API.
 *
 * Deliberately built on Node's built-in `http` module with ZERO external
 * dependencies so it runs anywhere Node 22+ is installed, with no install step:
 *
 *   node --experimental-strip-types packages/api/src/server.ts
 *
 * Production target is Fastify + Postgres/PostGIS + Redis, but the route logic,
 * the consent gate, and the response shapes below are exactly what ships. Every
 * location read passes through `assertCanTrack` and is written to the audit log.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  buildTrack,
  assertCanTrack,
  beginClaim,
  ConsentError,
  PLANS,
  projectRevenue,
  unitEconomics,
  DEFAULT_ASSUMPTIONS,
  type Ping,
} from '@platepath/shared';
import { store } from './store.ts';

const PORT = Number(process.env.PORT ?? 8787);

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { params: Record<string, string>; query: URLSearchParams; body: unknown },
) => void | Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const routes: Route[] = [];
function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/:[^/]+/g, (m) => {
        keys.push(m.slice(1));
        return '([^/]+)';
      }) +
      '/?$',
  );
  routes.push({ method, pattern, keys, handler });
}

function json(res: ServerResponse, status: number, data: unknown) {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(payload);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

route('GET', '/api/health', (_req, res) => {
  json(res, 200, { ok: true, service: 'platepath-api', vehicles: store.vehicles.length });
});

// Who am I / demo accounts.
route('GET', '/api/owners', (_req, res) => {
  json(res, 200, store.owners);
});

// Vehicles for an owner (with a trackable flag, so the UI can show the gate).
route('GET', '/api/vehicles', (_req, res, { query }) => {
  const ownerId = query.get('ownerId');
  if (!ownerId) return json(res, 400, { error: 'ownerId required' });
  const owner = store.owner(ownerId);
  if (!owner) return json(res, 404, { error: 'owner not found' });
  const vehicles = store.vehiclesForOwner(ownerId).map((v) => {
    let trackable = false;
    let reason: string | undefined;
    try {
      assertCanTrack(v, owner);
      trackable = true;
    } catch (e) {
      reason = e instanceof ConsentError ? e.code : 'BLOCKED';
    }
    return { ...v, trackable, reason };
  });
  json(res, 200, vehicles);
});

// THE core endpoint: a vehicle's traced path with time codes and per-segment
// speed. Blocked hard unless the caller owns AND has verified the vehicle.
route('GET', '/api/vehicles/:id/track', (_req, res, { params, query }) => {
  const ownerId = query.get('ownerId');
  const owner = ownerId ? store.owner(ownerId) : undefined;
  const vehicle = store.vehicle(params.id);
  if (!owner) return json(res, 400, { error: 'valid ownerId required' });
  if (!vehicle) return json(res, 404, { error: 'vehicle not found' });

  try {
    assertCanTrack(vehicle, owner);
  } catch (e) {
    const code = e instanceof ConsentError ? e.code : 'BLOCKED';
    store.audit({
      ts: new Date().toISOString(),
      ownerId: owner.id,
      vehicleId: vehicle.id,
      action: 'read_track',
      allowed: false,
      reason: code,
    });
    return json(res, 403, {
      error: 'access blocked by consent gate',
      code,
      message: (e as Error).message,
    });
  }

  const from = query.get('from') ? Date.parse(query.get('from')!) : undefined;
  const to = query.get('to') ? Date.parse(query.get('to')!) : undefined;
  const pings = store.pingsForVehicle(vehicle.id, from, to);
  const track = buildTrack(vehicle.id, pings, { speedingMarginMph: 5 });

  store.audit({
    ts: new Date().toISOString(),
    ownerId: owner.id,
    vehicleId: vehicle.id,
    action: 'read_track',
    allowed: true,
  });

  json(res, 200, { vehicle, track });
});

// Begin a plate claim (returns pending + next step; never verifies synchronously).
route('POST', '/api/claims', (_req, res, { body }) => {
  const b = (body ?? {}) as {
    ownerId?: string;
    plate?: string;
    state?: string;
    method?: string;
    drivers?: string[];
  };
  const owner = b.ownerId ? store.owner(b.ownerId) : undefined;
  if (!owner || !b.plate || !b.state || !b.method) {
    return json(res, 400, { error: 'ownerId, plate, state, method required' });
  }
  try {
    const result = beginClaim(
      { owner, plate: b.plate, state: b.state, method: b.method as never, drivers: b.drivers },
      store.vehicles.map((v) => ({ plate: v.plate, state: v.state, ownerId: v.ownerId })),
    );
    json(res, 201, result);
  } catch (e) {
    const code = e instanceof ConsentError ? e.code : 'ERROR';
    json(res, 409, { error: (e as Error).message, code });
  }
});

// Device ingestion endpoint (trackers POST pings here).
route('POST', '/api/ingest', (_req, res, { body }) => {
  const b = body as { pings?: Ping[] } | Ping[] | undefined;
  const pings = Array.isArray(b) ? b : b?.pings;
  if (!Array.isArray(pings)) return json(res, 400, { error: 'pings[] required' });
  const n = store.addPings(pings);
  json(res, 202, { accepted: n });
});

// Pricing + projections.
route('GET', '/api/pricing/plans', (_req, res) => json(res, 200, PLANS));

route('POST', '/api/pricing/projection', (_req, res, { body }) => {
  const assumptions = (body as { assumptions?: typeof DEFAULT_ASSUMPTIONS })?.assumptions ?? DEFAULT_ASSUMPTIONS;
  const horizon = (body as { horizonMonths?: number })?.horizonMonths ?? 36;
  const result = projectRevenue(assumptions, horizon);
  const economics = assumptions.map((a) => ({ segment: a.segment, ...unitEconomics(a) }));
  json(res, 200, { ...result, economics });
});

// Audit log (in production: an admin-only, tamper-evident view).
route('GET', '/api/audit', (_req, res) => json(res, 200, store.accessLog));

// ---------------------------------------------------------------------------
// Server plumbing
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const match = routes.find(
    (r) => r.method === req.method && r.pattern.test(url.pathname),
  );
  if (!match) return json(res, 404, { error: 'not found', path: url.pathname });

  const m = url.pathname.match(match.pattern)!;
  const params: Record<string, string> = {};
  match.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let parsed: unknown;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: 'invalid JSON body' });
      }
    }
    Promise.resolve(match.handler(req, res, { params, query: url.searchParams, body: parsed })).catch(
      (e) => json(res, 500, { error: (e as Error).message }),
    );
  });
});

server.listen(PORT, () => {
  console.log(`PlatePath API listening on http://localhost:${PORT}`);
});
