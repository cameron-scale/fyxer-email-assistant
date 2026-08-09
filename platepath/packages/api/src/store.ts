/**
 * In-memory data store, seeded with demo data. A production build swaps this for
 * Postgres/PostGIS (vehicles, owners, claims, an append-only pings table
 * partitioned by day, and an immutable access-audit log). The interface stays
 * the same so routes don't change.
 */
import {
  OWNERS,
  VEHICLES,
  generateDrive,
  type Owner,
  type Vehicle,
  type Ping,
} from '@platepath/shared';

export interface AccessLogEntry {
  ts: string;
  ownerId: string;
  vehicleId: string;
  action: string;
  allowed: boolean;
  reason?: string;
}

class Store {
  owners: Owner[] = [...OWNERS];
  vehicles: Vehicle[] = [...VEHICLES];
  pings: Ping[] = [];
  accessLog: AccessLogEntry[] = [];

  constructor() {
    // Seed a realistic drive for each verified vehicle.
    let seed = 42;
    for (const v of this.vehicles) {
      if (v.verificationStatus === 'verified') {
        this.pings.push(...generateDrive(v.id, '2026-08-09T14:02:00Z', 20, v.deviceType, seed++));
      }
    }
  }

  owner(id: string): Owner | undefined {
    return this.owners.find((o) => o.id === id);
  }

  vehicle(id: string): Vehicle | undefined {
    return this.vehicles.find((v) => v.id === id);
  }

  vehiclesForOwner(ownerId: string): Vehicle[] {
    return this.vehicles.filter((v) => v.ownerId === ownerId);
  }

  pingsForVehicle(vehicleId: string, fromTs?: number, toTs?: number): Ping[] {
    return this.pings.filter((p) => {
      if (p.vehicleId !== vehicleId) return false;
      const t = Date.parse(p.ts);
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t > toTs) return false;
      return true;
    });
  }

  addPings(incoming: Ping[]): number {
    this.pings.push(...incoming);
    return incoming.length;
  }

  audit(entry: AccessLogEntry): void {
    this.accessLog.push(entry);
  }
}

export const store = new Store();
