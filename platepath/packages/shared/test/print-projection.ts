/**
 * Prints the 3-year projection under conservative / base / aggressive scenarios.
 *   node --experimental-strip-types packages/shared/test/print-projection.ts
 * The numbers in docs/STRATEGY.md are generated from this exact model.
 */
import {
  projectRevenue,
  unitEconomics,
  DEFAULT_ASSUMPTIONS,
  type SegmentAssumption,
} from '../src/pricing.ts';

const usd = (n: number) =>
  '$' + Math.round(n).toLocaleString('en-US');

function scale(mult: number, growthDelta: number): SegmentAssumption[] {
  return DEFAULT_ASSUMPTIONS.map((a) => ({
    ...a,
    startingUnits: Math.round(a.startingUnits * mult),
    initialMonthlyAdds: Math.round(a.initialMonthlyAdds * mult),
    addGrowth: Math.max(0, a.addGrowth + growthDelta),
  }));
}

const scenarios: Record<string, SegmentAssumption[]> = {
  Conservative: scale(0.6, -0.03),
  Base: DEFAULT_ASSUMPTIONS,
  Aggressive: scale(1.5, 0.03),
};

for (const [name, assumptions] of Object.entries(scenarios)) {
  const p = projectRevenue(assumptions, 36);
  console.log(`\n=== ${name} ===`);
  console.log('Year 1 revenue: ', usd(p.summary.year1Revenue));
  console.log('Year 2 revenue: ', usd(p.summary.year2Revenue));
  console.log('Year 3 revenue: ', usd(p.summary.year3Revenue));
  console.log('Exit MRR (mo36):', usd(p.summary.endingMrr));
  console.log('Exit ARR:       ', usd(p.summary.endingArr));
  console.log('Active units:   ', p.summary.endingActiveUnits.toLocaleString('en-US'));
  console.log('Gross margin:   ', p.summary.grossMarginPct + '%');
  console.log('Cum. contribution (mo36):', usd(p.summary.cumulativeContribution));
}

console.log('\n=== Unit economics (base) ===');
for (const a of DEFAULT_ASSUMPTIONS) {
  const ue = unitEconomics(a);
  console.log(
    `${a.label.padEnd(28)} ARPU ${usd(a.arpu)}/mo  LTV ${usd(ue.ltv)}  CAC ${usd(ue.cac)}  LTV:CAC ${ue.ratio}  payback ${ue.paybackMonths}mo`,
  );
}

// Milestone table for the base case.
const base = projectRevenue(DEFAULT_ASSUMPTIONS, 36);
console.log('\n=== Base case milestones ===');
for (const m of [6, 12, 18, 24, 30, 36]) {
  const r = base.months[m - 1];
  console.log(
    `M${String(m).padStart(2)}  units ${String(r.activeUnits).padStart(6)}  MRR ${usd(r.mrr).padStart(12)}  ARR ${usd(r.arr).padStart(13)}`,
  );
}
