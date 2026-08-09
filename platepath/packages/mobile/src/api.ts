import type { Owner, Vehicle, Track } from '@platepath/shared';

// Point this at your deployed API. For the local reference server on a
// simulator, use http://localhost:8787; on a physical device use your LAN IP.
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

export type VehicleWithGate = Vehicle & { trackable: boolean; reason?: string };

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`);
  if (!r.ok) throw Object.assign(new Error(r.statusText), { status: r.status, body: await r.json().catch(() => ({})) });
  return r.json() as Promise<T>;
}

export const api = {
  owners: () => get<Owner[]>('/owners'),
  vehicles: (ownerId: string) => get<VehicleWithGate[]>(`/vehicles?ownerId=${ownerId}`),
  track: (vehicleId: string, ownerId: string) =>
    get<{ vehicle: Vehicle; track: Track }>(`/vehicles/${vehicleId}/track?ownerId=${ownerId}`),
};
