import type { Owner, Vehicle, Track } from '@platepath/shared';

const BASE = '/api';

export type VehicleWithGate = Vehicle & { trackable: boolean; reason?: string };

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.message ?? r.statusText), { status: r.status, body });
  }
  return r.json() as Promise<T>;
}

async function post<T>(path: string, data: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? r.statusText), { status: r.status, body });
  }
  return r.json() as Promise<T>;
}

export const api = {
  owners: () => get<Owner[]>('/owners'),
  vehicles: (ownerId: string) => get<VehicleWithGate[]>(`/vehicles?ownerId=${ownerId}`),
  track: (vehicleId: string, ownerId: string) =>
    get<{ vehicle: Vehicle; track: Track }>(`/vehicles/${vehicleId}/track?ownerId=${ownerId}`),
  claim: (data: { ownerId: string; plate: string; state: string; method: string; drivers?: string[] }) =>
    post<{ status: string; nextStep: string; disclosureRequired: boolean }>('/claims', data),
  projection: () => post<import('@platepath/shared').ProjectionResult>('/pricing/projection', {}),
};
