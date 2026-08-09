/**
 * PRICING & FINANCIAL PROJECTION MODEL
 * ------------------------------------
 * Per-vehicle SaaS + hardware, benchmarked against Life360, Bouncie, Samsara,
 * Motive, Verizon Connect, PassTime and Spireon (see docs/STRATEGY.md for the
 * competitive table and sources). All figures are assumptions you can edit;
 * `projectRevenue()` is the deterministic engine that turns them into a 36-month
 * P&L-style curve.
 */

export type Segment = 'family' | 'fleet' | 'dealer' | 'agency';

export interface Plan {
  id: string;
  name: string;
  segment: Segment;
  /** Recurring price per active vehicle per month (USD). */
  pricePerVehicleMo: number;
  /** One-time hardware charge to the customer per vehicle (USD). 0 = BYO/phone. */
  hardwareUpfront: number;
  /** Our cost for that hardware unit (USD COGS). */
  hardwareCost: number;
  /** Monthly cost to serve one active vehicle: connectivity + cloud (USD). */
  serveCostMo: number;
  blurb: string;
}

export const PLANS: Plan[] = [
  {
    id: 'family',
    name: 'Family',
    segment: 'family',
    pricePerVehicleMo: 12,
    hardwareUpfront: 0, // phone SDK or optional $49 OBD dongle
    hardwareCost: 0,
    serveCostMo: 1.1,
    blurb:
      'Up to 4 vehicles. Live location, trip history with per-segment speed, geofence & speeding alerts. Phone-based or optional OBD dongle.',
  },
  {
    id: 'fleet_starter',
    name: 'Fleet Starter',
    segment: 'fleet',
    pricePerVehicleMo: 20,
    hardwareUpfront: 0, // hardware bundled, amortized in the rate
    hardwareCost: 28,
    serveCostMo: 3.2,
    blurb:
      'SMB fleets (3–25 vehicles). OBD or hardwired GPS, live map, routes & speed, driver disclosure workflow, maintenance reminders.',
  },
  {
    id: 'fleet_pro',
    name: 'Fleet Pro',
    segment: 'fleet',
    pricePerVehicleMo: 33,
    hardwareUpfront: 0,
    hardwareCost: 45,
    serveCostMo: 4.5,
    blurb:
      'Growing fleets (25+). Everything in Starter plus API, ELD-ready telematics, safety scoring, and admin roles.',
  },
  {
    id: 'dealer',
    name: 'Dealer & Lender',
    segment: 'dealer',
    pricePerVehicleMo: 4, // low monthly; value is recovery + lot management at scale
    hardwareUpfront: 49,
    hardwareCost: 24,
    serveCostMo: 0.9,
    blurb:
      'BHPH / subprime lots. Hardwired trackers on financed inventory, lot management, lawful recovery workflow with lienholder verification.',
  },
  {
    id: 'agency',
    name: 'Agency',
    segment: 'agency',
    pricePerVehicleMo: 0, // seat + case based, quoted; modeled as ARPU below
    hardwareUpfront: 0,
    hardwareCost: 0,
    serveCostMo: 6,
    blurb:
      'Law-enforcement / licensed investigators. Case-based, audited access with lawful-process gating. Sold by seat + case, not per random plate.',
  },
];

export interface SegmentAssumption {
  segment: Segment;
  label: string;
  /** Active paid vehicles/units at the end of month 0 (launch). */
  startingUnits: number;
  /** Net new units added in month 1. */
  initialMonthlyAdds: number;
  /** Month-over-month growth in the *add rate* in month 1 (e.g. 0.10 = adds grow 10%/mo). */
  addGrowth: number;
  /**
   * Each month, the effective add-growth is multiplied by this (0<d<=1), so
   * growth tapers into an S-curve instead of compounding forever. 1 = no taper.
   * Default 0.94 keeps early momentum but avoids a 3-year hockey stick.
   */
  addGrowthDecay?: number;
  /** Monthly logo/unit churn (e.g. 0.03 = 3% of active units cancel/mo). */
  monthlyChurn: number;
  /** Blended revenue per active unit per month (USD) — SaaS ARPU for the seg. */
  arpu: number;
  /** Serve cost per active unit per month (USD). */
  serveCostMo: number;
  /** Fully-loaded cost to acquire one new unit (USD): sales, marketing, onboarding. */
  cac: number;
  /** Net hardware margin realized per new unit at activation (USD, can be <0). */
  hardwareMarginPerAdd: number;
}

/** Default 36-month assumptions. Conservative, editable. */
export const DEFAULT_ASSUMPTIONS: SegmentAssumption[] = [
  {
    segment: 'family',
    label: 'Family / consumer',
    startingUnits: 300,
    initialMonthlyAdds: 180,
    addGrowth: 0.11,
    monthlyChurn: 0.045,
    arpu: 11,
    serveCostMo: 1.1,
    cac: 42,
    hardwareMarginPerAdd: 0,
  },
  {
    segment: 'fleet',
    label: 'SMB & mid fleet',
    startingUnits: 120,
    initialMonthlyAdds: 90,
    addGrowth: 0.13,
    monthlyChurn: 0.018,
    arpu: 26,
    serveCostMo: 3.8,
    cac: 210,
    hardwareMarginPerAdd: -20, // hardware subsidized; recovered via LTV
  },
  {
    segment: 'dealer',
    label: 'Dealer & lender',
    startingUnits: 400,
    initialMonthlyAdds: 260,
    addGrowth: 0.10,
    monthlyChurn: 0.02,
    arpu: 4.5,
    serveCostMo: 0.9,
    cac: 60,
    hardwareMarginPerAdd: 22,
  },
  {
    segment: 'agency',
    label: 'Law enforcement / licensed PI',
    startingUnits: 0,
    initialMonthlyAdds: 4, // seats/cases, higher ARPU, slow controlled ramp
    addGrowth: 0.09,
    monthlyChurn: 0.01,
    arpu: 240,
    serveCostMo: 6,
    cac: 900,
    hardwareMarginPerAdd: 0,
  },
];

export interface MonthRow {
  month: number; // 1..N
  bySegment: Record<Segment, { active: number; adds: number; churned: number; mrr: number }>;
  activeUnits: number;
  newUnits: number;
  mrr: number;
  arr: number;
  saasRevenue: number;
  hardwareGross: number;
  serveCost: number;
  grossProfit: number;
  salesMarketing: number;
  contributionMargin: number; // grossProfit - S&M this month
  cumulativeContribution: number;
}

export interface ProjectionResult {
  months: MonthRow[];
  summary: {
    horizonMonths: number;
    endingActiveUnits: number;
    endingMrr: number;
    endingArr: number;
    year1Revenue: number;
    year2Revenue: number;
    year3Revenue: number;
    cumulativeContribution: number;
    grossMarginPct: number;
  };
}

/**
 * Deterministic cohort/flow projection. For each month and segment:
 *   adds_t   = round(adds_{t-1} * (1 + addGrowth))
 *   churn_t  = round(active_{t-1} * monthlyChurn)
 *   active_t = active_{t-1} + adds_t - churn_t
 * Revenue, cost, and contribution follow from ARPU / serve cost / CAC.
 */
export function projectRevenue(
  assumptions: SegmentAssumption[] = DEFAULT_ASSUMPTIONS,
  horizonMonths = 36,
): ProjectionResult {
  const segments = assumptions.map((a) => a.segment);
  const active: Record<string, number> = {};
  const adds: Record<string, number> = {};
  for (const a of assumptions) {
    active[a.segment] = a.startingUnits;
    adds[a.segment] = a.initialMonthlyAdds;
  }

  const months: MonthRow[] = [];
  let cumulative = 0;
  let totalSaas = 0;
  let totalServe = 0;

  for (let m = 1; m <= horizonMonths; m++) {
    const bySegment = {} as MonthRow['bySegment'];
    let activeUnits = 0;
    let newUnits = 0;
    let mrr = 0;
    let saasRevenue = 0;
    let hardwareGross = 0;
    let serveCost = 0;
    let salesMarketing = 0;

    for (const a of assumptions) {
      const decay = a.addGrowthDecay ?? 0.94;
      // Growth fades geometrically: month t uses addGrowth * decay^(t-1).
      const effGrowth = a.addGrowth * decay ** (m - 2);
      const addRate = m === 1 ? a.initialMonthlyAdds : adds[a.segment] * (1 + Math.max(0, effGrowth));
      const newThis = Math.round(addRate);
      adds[a.segment] = addRate;

      const churned = Math.round(active[a.segment] * a.monthlyChurn);
      active[a.segment] = Math.max(0, active[a.segment] + newThis - churned);

      const segMrr = active[a.segment] * a.arpu;
      bySegment[a.segment] = {
        active: active[a.segment],
        adds: newThis,
        churned,
        mrr: round(segMrr, 0),
      };

      activeUnits += active[a.segment];
      newUnits += newThis;
      mrr += segMrr;
      saasRevenue += segMrr;
      hardwareGross += newThis * a.hardwareMarginPerAdd;
      serveCost += active[a.segment] * a.serveCostMo;
      salesMarketing += newThis * a.cac;
    }

    const grossProfit = saasRevenue + hardwareGross - serveCost;
    const contributionMargin = grossProfit - salesMarketing;
    cumulative += contributionMargin;
    totalSaas += saasRevenue;
    totalServe += serveCost;

    months.push({
      month: m,
      bySegment,
      activeUnits,
      newUnits,
      mrr: round(mrr, 0),
      arr: round(mrr * 12, 0),
      saasRevenue: round(saasRevenue, 0),
      hardwareGross: round(hardwareGross, 0),
      serveCost: round(serveCost, 0),
      grossProfit: round(grossProfit, 0),
      salesMarketing: round(salesMarketing, 0),
      contributionMargin: round(contributionMargin, 0),
      cumulativeContribution: round(cumulative, 0),
    });
  }

  const revBetween = (start: number, end: number) =>
    months
      .slice(start, end)
      .reduce((s, r) => s + r.saasRevenue + r.hardwareGross, 0);

  const last = months[months.length - 1];
  return {
    months,
    summary: {
      horizonMonths,
      endingActiveUnits: last.activeUnits,
      endingMrr: last.mrr,
      endingArr: last.arr,
      year1Revenue: round(revBetween(0, 12), 0),
      year2Revenue: round(revBetween(12, 24), 0),
      year3Revenue: round(revBetween(24, 36), 0),
      cumulativeContribution: last.cumulativeContribution,
      grossMarginPct: round(((totalSaas - totalServe) / totalSaas) * 100, 1),
    },
  };
}

/** Simple LTV:CAC helper per segment (unit economics sanity check). */
export function unitEconomics(a: SegmentAssumption): {
  ltv: number;
  cac: number;
  ratio: number;
  paybackMonths: number;
} {
  const grossPerMo = a.arpu - a.serveCostMo;
  const avgLifetimeMo = a.monthlyChurn > 0 ? 1 / a.monthlyChurn : 60;
  const ltv = grossPerMo * avgLifetimeMo + a.hardwareMarginPerAdd;
  return {
    ltv: round(ltv, 0),
    cac: a.cac,
    ratio: round(ltv / a.cac, 2),
    paybackMonths: round(a.cac / Math.max(0.01, grossPerMo), 1),
  };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
