import type { LatLng } from './geo.ts';

/** How a location observation reached us. */
export type PingSource =
  | 'obd' // OBD-II plug-in tracker (consumer / light fleet)
  | 'hardwired' // hardwired GPS (dealer lot, heavy fleet, powersports)
  | 'phone' // phone SDK (family / driver app, foreground+background)
  | 'asset' // battery-powered asset tag (trailers, equipment)
  | 'alpr'; // licensed ALPR sighting (recovery / LE tier only, see LEGAL.md)

/** A single time-stamped location observation for one vehicle. */
export interface Ping {
  vehicleId: string;
  /** ISO-8601 UTC timestamp. */
  ts: string;
  lat: number;
  lng: number;
  /** Device-reported instantaneous speed (mph), if the sensor provides it. */
  speedMph?: number;
  /** Device-reported heading in degrees, if available. */
  headingDeg?: number;
  /** GPS horizontal accuracy in meters, if available (used for outlier rejection). */
  accuracyM?: number;
  source: PingSource;
}

/**
 * Ownership / consent verification status. Nothing can be tracked until a
 * vehicle reaches `verified`. This is the core anti-stalking control — see
 * consent.ts and docs/LEGAL.md.
 */
export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected';

export type VerificationMethod =
  | 'device_pairing' // a tracker we can see reporting from the vehicle proves possession
  | 'registration_doc' // uploaded state registration/title matched to the account holder
  | 'lienholder_record' // dealer/lender is the lienholder of record (BHPH, subprime)
  | 'fleet_admin_assignment' // company admin assigns a company-owned vehicle
  | 'le_legal_process'; // law-enforcement tier: warrant / lawful-process attestation

export type OwnerRole = 'family' | 'fleet' | 'dealer' | 'agency';

export interface Owner {
  id: string;
  displayName: string;
  role: OwnerRole;
  /** Verified email/identity of the account holder. */
  email: string;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  /** US license plate, uppercased, no spaces. */
  plate: string;
  /** Two-letter USPS state code. All 50 supported. */
  state: string;
  nickname?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  deviceType: PingSource;
  verificationStatus: VerificationStatus;
  verificationMethod?: VerificationMethod;
  /** People who have been notified that this vehicle is tracked (consent ledger). */
  disclosedTo?: string[];
}

/** One computed leg between two consecutive pings. */
export interface Segment {
  index: number;
  from: Ping;
  to: Ping;
  /** Distance for this leg, statute miles. */
  distanceMi: number;
  /** Elapsed time for this leg, seconds. */
  durationSec: number;
  /** Average speed over the leg, mph (distance / time). */
  speedMph: number;
  /** Heading of the leg in degrees. */
  headingDeg: number;
  /** True if this leg exceeds the applicable limit by the configured margin. */
  isSpeeding: boolean;
  /** Speed limit applied when evaluating `isSpeeding`, if known. */
  speedLimitMph?: number;
  /**
   * True when the gap to the previous ping exceeds the trip-break threshold;
   * the drawn path should not connect across a gap (parking, tunnel, signal loss).
   */
  isGap: boolean;
}

export interface TrackTotals {
  distanceMi: number;
  movingDurationSec: number;
  elapsedDurationSec: number;
  avgSpeedMph: number;
  maxSpeedMph: number;
  stops: number;
  speedingSegments: number;
}

/** A fully computed route for one vehicle over a time window. */
export interface Track {
  vehicleId: string;
  startTs: string;
  endTs: string;
  pings: Ping[];
  segments: Segment[];
  totals: TrackTotals;
}

export interface BuildTrackOptions {
  /**
   * Seconds of gap after which two pings are considered different trips and
   * the path is not drawn between them. Default 300 (5 min).
   */
  tripBreakSec?: number;
  /**
   * Speeds above this (mph) are treated as GPS error and the leg is dropped
   * from max-speed stats. Default 130.
   */
  maxPlausibleMph?: number;
  /** GPS accuracy (m) worse than this drops the ping. Default 100. */
  maxAccuracyM?: number;
  /** Margin over the limit (mph) before a leg is flagged speeding. Default 5. */
  speedingMarginMph?: number;
  /** Default limit (mph) when a ping carries no per-segment limit. Optional. */
  defaultSpeedLimitMph?: number;
  /** Below this speed (mph) a ping counts toward a "stop". Default 1.5. */
  stopSpeedMph?: number;
}
