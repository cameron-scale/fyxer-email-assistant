import { buildReviewGroups, reviewGroupOf } from '../src/lib/reviewGroups';

const mk = (from, subject, extra = {}) => ({
  id: Math.random().toString(36).slice(2),
  from, subject, preview: extra.preview || '', date: '2026-06-14T12:00:00Z', ...extra,
});

describe('reviewGroups', () => {
  test('promotions, newsletters, social, receipts, notifications land in the right groups', () => {
    const emails = [
      mk('Nike <news@nike.com>', 'Final hours — 30% off everything ends tonight'),
      mk('Morning Brew <crew@morningbrew.com>', 'Your daily newsletter digest'),
      mk('LinkedIn <notify@linkedin.com>', 'You appeared in 12 searches this week'),
      mk('Stripe <receipts@stripe.com>', 'Your receipt for invoice #INV-20418'),
      mk('Microsoft <no-reply@microsoft.com>', 'Your verification code is 573426'),
    ];
    const groups = buildReviewGroups(emails);
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    expect(byId.promotions?.count).toBe(1);
    expect(byId.newsletters?.count).toBe(1);
    expect(byId.social?.count).toBe(1);
    expect(byId.receipts?.count).toBe(1);
    expect(byId.notifications?.count).toBe(1);
  });

  test('each email belongs to at most one group (no double categorization)', () => {
    const emails = [
      mk('Nike <news@nike.com>', '30% off sale'),
      mk('LinkedIn <notify@linkedin.com>', 'New connection request'),
      mk('Jane Client <jane@acme.com>', 'Re: our contract'),
    ];
    const groups = buildReviewGroups(emails);
    const seen = new Set();
    for (const g of groups) {
      for (const e of g.emails) {
        expect(seen.has(e.id)).toBe(false);
        seen.add(e.id);
      }
    }
  });

  test('important / personal mail is kept out of the bulk review (returns null)', () => {
    const vip = mk('Big Client <ceo@bigco.com>', 'Need this today', { preview: 'urgent please respond' });
    expect(reviewGroupOf({ ...vip, priority: { isVip: true, bucket: 'important', category: 'Client', senderName: 'Big Client', senderEmail: 'ceo@bigco.com' } })).toBeNull();
  });

  test('previews are de-duplicated by sender', () => {
    const emails = [
      mk('Nike <news@nike.com>', 'Deal 1 — 20% off'),
      mk('Nike <news@nike.com>', 'Deal 2 — 30% off'),
      mk('Adidas <news@adidas.com>', 'Sale 50% off'),
    ];
    const groups = buildReviewGroups(emails);
    const promos = groups.find((g) => g.id === 'promotions');
    expect(promos.count).toBe(3);
    // Two Nike + one Adidas → only two distinct preview rows.
    const senders = promos.previews.map((p) => p[0]);
    expect(new Set(senders).size).toBe(senders.length);
  });
});
