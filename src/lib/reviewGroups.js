// reviewGroups.js — turns a set of REAL emails into the "Review groups" the Bulk
// Triage screen shows: promotions, newsletters, social, notifications, receipts,
// and a dedicated "Review Required" group for anything low-confidence (could be a
// real person or needs a decision). Runs on-device from the same signals as the
// priority engine — no network, no fabricated counts.

import { scoreEmail, parseSender } from './priority';

const GROUP_META = {
  review: {
    name: 'Review Required', icon: 'eye', color: '#F59E0B', type: 'need a decision',
    recommendation: 'Review', defaultAction: 'review',
  },
  promotions: {
    name: 'Promotions & Deals', icon: 'pricetag', color: '#6B7280', type: 'promotional emails',
    recommendation: 'Archive', defaultAction: 'archive',
  },
  newsletters: {
    name: 'Newsletters', icon: 'newspaper', color: '#6B7280', type: 'newsletters',
    recommendation: 'Archive', defaultAction: 'archive',
  },
  social: {
    name: 'Social & Community', icon: 'people', color: '#2DD4BF', type: 'social updates',
    recommendation: 'Archive', defaultAction: 'archive',
  },
  notifications: {
    name: 'Notifications', icon: 'notifications', color: '#818CF8', type: 'automated notifications',
    recommendation: 'Archive', defaultAction: 'archive',
  },
  receipts: {
    name: 'Receipts & Invoices', icon: 'receipt', color: '#F59E0B', type: 'receipts & invoices',
    recommendation: 'Keep', defaultAction: 'keep',
  },
};
// Review Required first (it needs attention), then the archivable groups.
const GROUP_ORDER = ['review', 'promotions', 'newsletters', 'social', 'notifications', 'receipts'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(d) {
  const t = new Date(d || 0);
  if (Number.isNaN(t.getTime()) || !d) return '';
  return `${MONTHS[t.getMonth()]} ${t.getDate()}`;
}

// Is this an automated/bulk address (no-reply, notifications@, mailer, etc.)?
function isAutomatedAddress(email = '') {
  return /(no-?reply|noreply|do-?not-?reply|donotreply|notifications?|alerts?|mailer|automated|updates?|newsletter|digest|marketing|promo)@/.test(String(email).toLowerCase());
}

// Decide which review group an email belongs to. Returns null for mail that should
// stay in the inbox (important / from real, wanted people) — the review screen is
// only for clearing low-value bulk mail.
export function reviewGroupOf(email) {
  const p = email.priority || scoreEmail(email);
  const sender = `${p.senderName} ${p.senderEmail}`.toLowerCase();
  const hay = `${email.subject || ''} ${email.preview || email.snippet || email.body || ''}`.toLowerCase();
  // A real person: a "First Last" name from a non-automated address.
  const human = /\s/.test(String(p.senderName || '').trim()) && !isAutomatedAddress(p.senderEmail);
  // Never pull genuinely important mail into the bulk-archive review. "Action
  // Needed" is only kept out when it's from a real person — automated invoice /
  // order / receipt mail also lands in Action Needed (it contains "invoice" etc.)
  // and belongs in the Receipts group, not the inbox.
  if (p.isVip || p.isKnown || p.bucket === 'urgent'
    || p.category === 'Client' || p.category === 'Meeting'
    || (p.category === 'Action Needed' && human)) {
    return null;
  }

  // Social networks & community.
  if (/\b(linkedin|facebook|twitter|instagram|reddit|tiktok|pinterest|nextdoor|meetup|snapchat|discord|youtube)\b/.test(sender)
    || sender.includes('x.com')
    || /(mentioned you|tagged you|new follower|connection request|appeared in \d+ searches|wants to connect|new message in #|invited you to|reacted to your)/.test(hay)) {
    return 'social';
  }
  // Receipts / invoices / orders.
  if (/\b(receipt|invoice|order (confirmation|confirmed|#|number)|your order|order has shipped|payment (received|confirmation)|billing|statement|your purchase|renewal|subscription (renew|confirm))\b/.test(hay)
    || /(billing|invoices?|receipts?|payments?|orders?|store)@/.test(sender)) {
    return 'receipts';
  }
  // Promotions & deals.
  if (/(% off|\bsale\b|discount|\bdeal\b|\bpromo\b|coupon|limited time|shop now|save (up to|big|now)|clearance|flash sale|final hours|ends (tonight|soon|today)|new arrivals|best sellers|\boffer\b|exclusive|black friday|cyber monday|buy now|don't miss)/.test(hay)) {
    return 'promotions';
  }
  // Automated notifications / security codes.
  if (isAutomatedAddress(p.senderEmail)
    || /(verification code|security alert|sign-in|password reset|confirm your (email|account)|your code is|two-factor|2fa|reset your password|new sign-in)/.test(hay)) {
    // A digest-y automated sender reads better as a newsletter.
    if (/(newsletter|digest|weekly|daily|roundup|bulletin)/.test(hay)) return 'newsletters';
    return 'notifications';
  }
  // Newsletters / digests.
  if (p.category === 'Newsletter'
    || /(newsletter|digest|weekly (recap|roundup|digest|update)|daily (digest|brief)|roundup|bulletin|this week in|latest from|update from)/.test(hay)) {
    return 'newsletters';
  }
  // A real person that isn't obviously important → let the user decide.
  if (human) return 'review';
  // Clearly-noise leftovers read as newsletters; everything else needs a look.
  if (p.bucket === 'noise') return 'newsletters';
  return 'review';
}

// Build the ordered list of groups from a set of emails. Each group is shaped like
// the screen expects: { id, name, icon, color, type, count, confidence,
// recommendation, defaultAction, warning, emails, previews }.
export function buildReviewGroups(emails = [], opts = {}) {
  const map = {};
  for (const e of emails) {
    const scored = e.priority ? e : { ...e, priority: scoreEmail(e, opts) };
    const g = reviewGroupOf(scored);
    if (!g) continue;
    (map[g] = map[g] || []).push(scored);
  }
  return GROUP_ORDER.filter((k) => map[k] && map[k].length).map((k) => {
    const list = map[k];
    const meta = GROUP_META[k];
    // Distinct previews (one row per sender) so the card never shows duplicates.
    const seen = new Set();
    const previews = [];
    for (const e of list) {
      const key = (e.priority.senderEmail || e.priority.senderName || '').toLowerCase();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      previews.push([
        e.priority.senderName || e.priority.senderEmail || 'Unknown',
        e.subject || '(no subject)',
        shortDate(e.date),
      ]);
      if (previews.length >= 8) break;
    }
    const warning = k === 'review'
      ? 'These could be from real people or need a decision — look before archiving.'
      : (k === 'receipts' ? 'Some may be tax-relevant — keep or snooze rather than archive.' : null);
    return {
      id: k,
      ...meta,
      count: list.length,
      confidence: k === 'review' ? null : 99,
      warning,
      emails: list,
      previews,
    };
  });
}

export { GROUP_META, parseSender };
