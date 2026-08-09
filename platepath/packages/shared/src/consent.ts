import type {
  Vehicle,
  Owner,
  VerificationMethod,
  VerificationStatus,
} from './types.ts';

/**
 * CONSENT & OWNERSHIP GATE
 * ------------------------
 * The founder's original idea was "only works with license plates you register,
 * so stalkers can't use it." That gate is necessary but NOT sufficient: anyone
 * can *type* any plate into a box. Registration is not proof of ownership, and
 * ownership of a car is not the same as consent of the person driving it.
 *
 * So the real anti-abuse design has two independent requirements that BOTH must
 * pass before a single location point is ever shown:
 *
 *   1. PROOF OF CONTROL — you must prove you actually own/control the vehicle,
 *      via one of the verification methods below. Typing a plate is not enough.
 *   2. DISCLOSURE TO DRIVERS — for anyone who might drive the car who is not the
 *      account holder, the product requires a recorded disclosure (and, for
 *      adults, affirmative consent) that the vehicle is tracked. This is both an
 *      ethics control and what most state electronic-tracking statutes require.
 *
 * This module is deliberately the choke point: the apps and API call
 * `assertCanTrack()` before returning any track. There is no code path that
 * shows a location for an unverified vehicle.
 */

export class ConsentError extends Error {
  code:
    | 'NOT_OWNER'
    | 'NOT_VERIFIED'
    | 'PLATE_ALREADY_CLAIMED'
    | 'DISCLOSURE_REQUIRED'
    | 'ROLE_METHOD_MISMATCH';
  constructor(code: ConsentError['code'], message: string) {
    super(message);
    this.name = 'ConsentError';
    this.code = code;
  }
}

/** Which verification methods are acceptable for each account role. */
const ALLOWED_METHODS: Record<Owner['role'], VerificationMethod[]> = {
  family: ['device_pairing', 'registration_doc'],
  fleet: ['device_pairing', 'fleet_admin_assignment', 'registration_doc'],
  dealer: ['lienholder_record', 'device_pairing', 'registration_doc'],
  agency: ['le_legal_process', 'device_pairing'],
};

export interface ClaimRequest {
  owner: Owner;
  plate: string;
  state: string;
  method: VerificationMethod;
  /** For family/fleet: names of drivers who must be disclosed to. */
  drivers?: string[];
}

export interface ClaimResult {
  status: VerificationStatus;
  method: VerificationMethod;
  /** Human-readable next step required to reach `verified`. */
  nextStep: string;
  disclosureRequired: boolean;
}

/**
 * Begin claiming a plate. Enforces one-owner-per-plate and role/method rules.
 * Returns the *pending* state and what the user must still do; it never returns
 * `verified` synchronously — verification always requires an out-of-band proof
 * (a device that starts reporting, a reviewed document, a lien record, a signed
 * LE attestation). That asymmetry is what stops casual abuse.
 */
export function beginClaim(
  req: ClaimRequest,
  existingClaims: Pick<Vehicle, 'plate' | 'state' | 'ownerId'>[],
): ClaimResult {
  const allowed = ALLOWED_METHODS[req.owner.role];
  if (!allowed.includes(req.method)) {
    throw new ConsentError(
      'ROLE_METHOD_MISMATCH',
      `A ${req.owner.role} account cannot verify via ${req.method}.`,
    );
  }

  const plate = normalizePlate(req.plate);
  const claimedByOther = existingClaims.find(
    (c) =>
      normalizePlate(c.plate) === plate &&
      c.state === req.state &&
      c.ownerId !== req.owner.id,
  );
  if (claimedByOther) {
    // A plate can only be actively claimed by one account. A second claimant
    // triggers a dispute review, not a silent grant — this blocks the "type my
    // ex's plate" attack even if they somehow had a document.
    throw new ConsentError(
      'PLATE_ALREADY_CLAIMED',
      'This plate is already verified to another account. Submit a dispute with proof of current ownership.',
    );
  }

  const disclosureRequired =
    (req.owner.role === 'family' || req.owner.role === 'fleet') &&
    (req.drivers?.length ?? 0) > 0;

  return {
    status: 'pending',
    method: req.method,
    disclosureRequired,
    nextStep: NEXT_STEP[req.method],
  };
}

const NEXT_STEP: Record<VerificationMethod, string> = {
  device_pairing:
    'Install the paired tracker in the vehicle. Verification completes automatically once the device reports from the vehicle.',
  registration_doc:
    'Upload the current state registration or title. Our review confirms the name matches the account holder (typically minutes to 1 business day).',
  lienholder_record:
    'We match the VIN/plate against your dealer/lender lienholder record of file. Verification completes on match.',
  fleet_admin_assignment:
    'A verified company administrator assigns this company-owned vehicle to a driver/asset.',
  le_legal_process:
    'Attach the case number and lawful-process reference (warrant/exigency). A supervisor co-signs before tracking is enabled.',
};

/**
 * The single gate every read path must call. Throws unless the vehicle is
 * verified to this owner AND any required disclosures are on record.
 */
export function assertCanTrack(vehicle: Vehicle, owner: Owner): void {
  if (vehicle.ownerId !== owner.id) {
    throw new ConsentError('NOT_OWNER', 'You do not own this vehicle.');
  }
  if (vehicle.verificationStatus !== 'verified') {
    throw new ConsentError(
      'NOT_VERIFIED',
      'Ownership is not verified yet. Location history is locked until verification completes.',
    );
  }
  if (requiresDisclosure(vehicle, owner) && !(vehicle.disclosedTo?.length)) {
    throw new ConsentError(
      'DISCLOSURE_REQUIRED',
      'At least one driver must be disclosed/consented before tracking is enabled.',
    );
  }
}

/** Non-throwing convenience wrapper for UI. */
export function canTrack(vehicle: Vehicle, owner: Owner): boolean {
  try {
    assertCanTrack(vehicle, owner);
    return true;
  } catch {
    return false;
  }
}

function requiresDisclosure(vehicle: Vehicle, owner: Owner): boolean {
  // Family & fleet vehicles are driven by other people → disclosure required.
  // Dealer lot inventory (no assigned driver) and single-owner assets do not.
  return owner.role === 'family' || owner.role === 'fleet';
}

export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
