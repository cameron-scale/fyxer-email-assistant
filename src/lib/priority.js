// priority.js
// This is the "brain" of Brisk. It reads an email and decides how important it is.
//
// It does NOT need the internet or any AI service — it's a fast set of rules that
// runs instantly on your phone. Each email gets:
//   - a numeric score (higher = more important)
//   - a bucket: 'urgent' | 'important' | 'fyi' | 'noise'
//   - a short human reason ("Mentions a deadline", "From a real person", ...)
//   - a one-line TL;DR summary
//
// You can tweak the word lists below to teach it about your own world.

const URGENT_WORDS = [
  'urgent', 'asap', 'immediately', 'right away', 'eod', 'end of day',
  'deadline', 'overdue', 'past due', 'final notice', 'action required',
  'time sensitive', 'expires', 'expiring', 'last chance', 'today', 'now',
  'emergency', 'critical', 'important update', 'payment failed', 'declined',
];

const IMPORTANT_WORDS = [
  'invoice', 'contract', 'proposal', 'quote', 'meeting', 'call', 'schedule',
  'review', 'approve', 'approval', 'sign', 'signature', 'reply', 'respond',
  'question', 'follow up', 'feedback', 'offer', 'interview', 'order',
  'reschedule', 'confirm', 'available', 'availability',
];

const NOISE_WORDS = [
  'unsubscribe', 'newsletter', 'no-reply', 'noreply', 'notification',
  'promotion', 'promotional', 'sale', '% off', 'discount', 'deal',
  'webinar', 'survey', 'digest', 'weekly recap', 'marketing', 'sponsored',
  'view in browser', 'manage preferences', 'opt out',
];

// Senders that are almost always automated / low priority.
const NOISE_SENDER_HINTS = [
  'no-reply', 'noreply', 'donotreply', 'do-not-reply', 'notifications',
  'newsletter', 'mailer', 'marketing', 'updates@', 'info@', 'hello@',
  'support@', 'team@', 'news@', 'digest', 'offers@', 'deals@', 'sales@',
  'promo', 'no_reply',
];

function countMatches(text, words) {
  let n = 0;
  for (const w of words) {
    if (text.includes(w)) n += 1;
  }
  return n;
}

// Pull a clean display name out of a "From" field like: Jane Doe <jane@acme.com>
export function parseSender(from = '') {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*<(.+?)>/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  }
  const email = (from.match(/[^\s<>]+@[^\s<>]+/) || [from])[0].toLowerCase();
  const name = email.split('@')[0].replace(/[._]/g, ' ');
  return { name, email };
}

// Turn the body into a tidy one-line TL;DR.
export function summarize(body = '', maxLen = 110) {
  const clean = body
    .replace(/<[^>]+>/g, ' ') // strip any HTML tags
    .replace(/https?:\/\/\S+/g, '') // drop raw links
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'No preview available.';
  // Prefer the first "real" sentence.
  const sentences = clean.match(/[^.!?]+[.!?]?/g) || [clean];
  let pick = sentences.find((s) => s.trim().split(/\s+/).length >= 4) || sentences[0];
  pick = pick.trim();
  if (pick.length > maxLen) pick = pick.slice(0, maxLen - 1).trim() + '…';
  return pick;
}

// Work out a Fyxer-style category label (what KIND of email this is).
// This is separate from priority (how URGENT it is) so you get both:
// e.g. "Important · To Respond" or "Noise · Promotions".
function categorize(haystack, signals) {
  const { noisySender, isQuestion, importantHits, looksHuman } = signals;
  if (/(% off|sale|discount|\bdeal\b|promo|limited time|shop now|offer|coupon)/.test(haystack))
    return 'Promotions';
  if (/(unsubscribe|newsletter|digest|weekly recap|view in browser|read more|this week)/.test(haystack))
    return 'Newsletter';
  if (/(meeting|\bcall\b|schedule|reschedule|calendar|invite|catch up|\bsync\b|availability|book a)/.test(haystack))
    return 'Meeting';
  if (noisySender && !isQuestion) return 'Notification';
  if (isQuestion || importantHits > 0 || looksHuman) return 'To Respond';
  return 'FYI';
}

// The main scorer. Give it a normalized email, get back priority info.
// options.vips = array of lowercased sender emails you've marked as VIP.
export function scoreEmail(email, options = {}) {
  const vips = options.vips || [];
  const sender = parseSender(email.from || email.sender || '');
  const haystack = `${email.subject || ''} ${email.body || email.snippet || ''}`.toLowerCase();
  const senderStr = `${sender.name} ${sender.email}`.toLowerCase();
  const isVip = vips.includes(sender.email);

  let score = 0;
  const reasons = [];

  // --- Signals that push importance UP ---
  const urgentHits = countMatches(haystack, URGENT_WORDS);
  if (urgentHits) {
    score += 45 + urgentHits * 6;
    reasons.push('Sounds time-sensitive');
  }

  const importantHits = countMatches(haystack, IMPORTANT_WORDS);
  if (importantHits) {
    score += 14 + importantHits * 5;
    reasons.push('Looks like it needs an action');
  }

  // A direct question usually wants a reply.
  const isQuestion = `${email.subject} ${email.body || ''}`.includes('?');
  if (isQuestion) {
    score += 12;
    reasons.push('Asks a question');
  }

  // VIP senders you've taught Brisk about always float to the top.
  if (isVip) {
    score += 60;
    reasons.unshift('⭐ VIP sender');
  }

  // Addressed to you personally (your first name appears) — lightweight check.
  if (email.body && /\b(hi|hey|hello|dear)\b/i.test(email.body.slice(0, 60))) {
    score += 6;
  }

  // Unread is slightly more pressing than already-read.
  if (email.read === false) score += 8;

  // Flagged / starred in the source mailbox.
  if (email.flagged) {
    score += 25;
    reasons.push('You flagged it');
  }

  // --- Signals that push importance DOWN (noise) ---
  const noiseHits = countMatches(haystack, NOISE_WORDS);
  const noisySender = NOISE_SENDER_HINTS.some((h) => senderStr.includes(h));
  if (noiseHits) {
    score -= 20 + noiseHits * 8;
  }
  if (noisySender) {
    score -= 22;
  }
  if (noiseHits || noisySender) {
    reasons.push('Looks automated / promotional');
  }

  // A real person (name with a space, not a no-reply address) gets a nudge up.
  const looksHuman = /\s/.test(sender.name.trim()) && !noisySender;
  if (looksHuman) {
    score += 10;
    reasons.push('From a real person');
  }

  // --- Decide the bucket from the final score ---
  let bucket;
  if (urgentHits >= 1 && !noisySender) {
    bucket = 'urgent';
  } else if (score >= 30) {
    bucket = 'important';
  } else if (score <= 0) {
    bucket = 'noise';
  } else {
    bucket = 'fyi';
  }

  const category = categorize(haystack, {
    noisySender,
    isQuestion,
    importantHits,
    looksHuman,
  });

  // Promotional / newsletter mail is never urgent or important — it's noise,
  // no matter how loudly it shouts ("Sale ends today!"). VIPs are exempt.
  if ((category === 'Promotions' || category === 'Newsletter') && !isVip) {
    bucket = 'noise';
  }

  // Extra guard: a noisy/automated sender shouldn't be urgent either.
  if ((noisySender || noiseHits >= 2) && bucket === 'urgent' && !isVip) bucket = 'noise';

  // VIPs never get buried in Noise/FYI — bump them to at least Important.
  if (isVip && (bucket === 'noise' || bucket === 'fyi')) bucket = 'important';

  return {
    score,
    bucket,
    category,
    isVip,
    reason: reasons[0] || 'General message',
    reasons,
    senderName: sender.name,
    senderEmail: sender.email,
    tldr: summarize(email.body || email.snippet || ''),
  };
}

// Bucket metadata used by the UI (label + which theme color to use).
export const BUCKETS = {
  urgent: { label: 'Urgent', order: 0, colorKey: 'urgent' },
  important: { label: 'Important', order: 1, colorKey: 'important' },
  fyi: { label: 'FYI', order: 2, colorKey: 'fyi' },
  noise: { label: 'Noise', order: 3, colorKey: 'noise' },
};

// Take raw emails -> attach priority -> sort best-first.
// vips = array of lowercased sender emails the user marked important.
export function prioritize(rawEmails, vips = []) {
  return rawEmails
    .map((e) => ({ ...e, priority: scoreEmail(e, { vips }) }))
    .sort((a, b) => {
      const ord =
        BUCKETS[a.priority.bucket].order - BUCKETS[b.priority.bucket].order;
      if (ord !== 0) return ord;
      return b.priority.score - a.priority.score;
    });
}
