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

// Genuinely time-sensitive language. Promo-urgency ("last chance", "expires",
// "today only") deliberately lives in NOISE_WORDS instead — marketing shouting
// "act now" is not the same as a real deadline.
const URGENT_WORDS = [
  'urgent', 'asap', 'immediately', 'right away', 'eod', 'end of day',
  'deadline', 'overdue', 'past due', 'final notice', 'action required',
  'time sensitive', 'as soon as possible',
  'emergency', 'critical', 'payment failed', 'card declined',
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
  // Promo-urgency: marketing dressed up as a deadline.
  'last chance', 'act now', 'today only', 'limited time', 'shop now',
  'expires', 'expiring', 'ends soon', "don't miss", 'save now', 'hurry',
  'final hours', 'flash sale',
  // Content marketing / "thought leadership" blasts.
  'how to', 'best practices', 'free trial', 'ebook', 'e-book',
  'case study', 'new feature', 'introducing', 'register now', 'sign up today',
];

// Senders that are almost always automated / low priority.
const NOISE_SENDER_HINTS = [
  'no-reply', 'noreply', 'donotreply', 'do-not-reply', 'notifications',
  'newsletter', 'mailer', 'marketing', 'updates@', 'info@', 'hello@',
  'support@', 'team@', 'news@', 'digest', 'offers@', 'deals@', 'sales@',
  'promo', 'no_reply', 'panel', 'insights', 'academy', 'community',
];

// A "list/brand" sender NAME (e.g. "Claude for HR Professionals", "Acme Weekly")
// rather than a real person — almost always bulk/marketing. Returns true when the
// from-name reads like a topic/brand instead of "First Last".
function isBrandSender(sender) {
  const name = String(sender.name || '').toLowerCase();
  const local = String(sender.email || '').split('@')[0];
  if (/\b(for|weekly|daily|newsletter|digest|insights|panel|academy|community|updates|team|news)\b/.test(name)) return true;
  if (/(news|info|updates|hello|team|digest|insights|panel|academy|community|notif|mailer|marketing|promo)/.test(local)) return true;
  return false;
}

// Map the raw score (~-20..120) to a nuanced 1.0–10.0 urgency rank.
export function score10(score) {
  const v = (score + 20) / 140; // -20 -> 0, 120 -> 1
  return Math.round(Math.max(1, Math.min(10, 1 + v * 9)) * 10) / 10;
}

// Count keyword hits with word-ish boundaries so "now" doesn't match inside
// "known", "sign" inside "design", or "call" inside "typically". A match must not
// be flanked by another letter; digits/punctuation/spaces are fine.
function countMatches(text, words) {
  let n = 0;
  for (const w of words) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^a-z])${esc}(?![a-z])`, 'gi');
    const m = text.match(re);
    if (m) n += m.length;
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

// The consolidated category system — exactly six tags so the color language is
// learnable in one session. Urgent + Client are assigned in scoreEmail (from the
// bucket / VIP status); categorize() returns the other four.
//   Promotions/sales/newsletters/digests  -> Newsletter
//   meetings/calls/scheduling             -> Meeting
//   questions / needs-an-action           -> Action Needed   (was To Respond / Action Required)
//   automated notifications / everything else -> FYI          (Notification merged into FYI)
export const CATEGORIES = ['Urgent', 'Client', 'Action Needed', 'Meeting', 'Newsletter', 'FYI'];
// Highest-priority first — used to pick the single tag a card shows.
export const CATEGORY_ORDER = ['Urgent', 'Client', 'Action Needed', 'Meeting', 'Newsletter', 'FYI'];

function categorize(haystack, signals) {
  const { noisySender, isQuestion, importantHits, looksHuman, noiseHits, brandSender } = signals;
  // Automated / bulk / brand / Outlook-"Other" senders and promotional content are
  // Newsletters — even when they ask a rhetorical question ("Do you know your...?")
  // or shout a fake deadline. This is checked FIRST so marketing never lands in
  // "Action Needed".
  if (noisySender || brandSender || noiseHits > 0
    || /(% off|sale|discount|\bdeal\b|promo|limited time|shop now|offer|coupon|unsubscribe|newsletter|digest|weekly recap|view in browser|this week|how to|best practices|webinar|ebook|free trial|productivity|new arrivals|best sellers|save up to|save big|exclusive|subscribe|bonus|rewards|points|cashback|gift card|don't miss|trending|featured)/.test(haystack))
    return 'Newsletter';
  if (/(meeting|\bcall\b|schedule|reschedule|calendar|invite|catch up|\bsync\b|availability|book a)/.test(haystack))
    return 'Meeting';
  // A real, direct ask from a human → Action Needed (noisy senders already excluded).
  if ((isQuestion || importantHits > 0) && !noisySender) return 'Action Needed';
  if (looksHuman && !noisySender) return 'Action Needed';
  return 'FYI';
}

// The main scorer. Give it a normalized email, get back priority info.
// options.vips = array of lowercased sender emails you've marked as VIP.
export function scoreEmail(email, options = {}) {
  const vips = options.vips || [];
  const sender = parseSender(email.from || email.sender || '');
  // Categorize from the STABLE preview (never the full body, which loads later and
  // would otherwise flip an email's category when you open it). Falls back to body.
  const text = email.preview || email.snippet || email.body || '';
  const haystack = `${email.subject || ''} ${text}`.toLowerCase();
  const senderStr = `${sender.name} ${sender.email}`.toLowerCase();
  const isVip = vips.includes(sender.email);
  // Senders the AI learned are important to you (from "Learn my inbox"). They get a
  // strong boost — but a notch below an explicit VIP you chose yourself.
  const knownImportant = options.knownImportant || [];
  const isKnown = !isVip && knownImportant.includes(sender.email);
  // Outlook's own Focused/Other verdict: 'other' is a strong newsletter/noise hint.
  const inferredOther = email.inferred === 'other' && !isVip && !isKnown;

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
  const isQuestion = `${email.subject} ${text}`.includes('?');
  if (isQuestion) {
    score += 12;
    reasons.push('Asks a question');
  }

  // VIP senders you've taught Brisk about always float to the top.
  if (isVip) {
    score += 60;
    reasons.unshift('⭐ VIP sender');
  } else if (isKnown) {
    // Learned-important contacts get a strong nudge, just below a hand-picked VIP.
    score += 35;
    reasons.unshift('Important contact (learned from your inbox)');
  }

  // Addressed to you personally (a greeting near the top) — lightweight check.
  if (text && /\b(hi|hey|hello|dear)\b/i.test(text.slice(0, 60))) {
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
  const brandSender = isBrandSender(sender) && !isVip && !isKnown;
  const noisySender = (NOISE_SENDER_HINTS.some((h) => senderStr.includes(h)) || brandSender) && !isVip && !isKnown;
  if (noiseHits) {
    score -= 20 + noiseHits * 8;
  }
  if (noisySender) {
    score -= 22;
  }
  // Outlook filed it as "Other" — treat it like automated/bulk mail.
  if (inferredOther) {
    score -= 24;
  }
  if (noiseHits || noisySender || inferredOther) {
    reasons.push('Looks automated / promotional');
  }

  // A real person (name with a space, not a no-reply address) gets a nudge up.
  const looksHuman = /\s/.test(sender.name.trim()) && !noisySender;
  if (looksHuman) {
    score += 10;
    reasons.push('From a real person');
  }

  // --- Decide the bucket from the final score ---
  // "Other" mail (newsletters/bulk) is never urgent, regardless of buzzwords.
  let bucket;
  if (urgentHits >= 1 && !noisySender && !inferredOther) {
    bucket = 'urgent';
  } else if (score >= 30) {
    bucket = 'important';
  } else if (score <= 0) {
    bucket = 'noise';
  } else {
    bucket = 'fyi';
  }

  let category = categorize(haystack, {
    noisySender: noisySender || inferredOther,
    isQuestion,
    importantHits,
    looksHuman,
    noiseHits,
    brandSender,
  });

  // Newsletter/promotional mail is never urgent or important. VIPs (and learned
  // important contacts) are exempt.
  if (category === 'Newsletter' && !isVip && !isKnown) {
    bucket = 'noise';
  }
  // VIP senders are your clients / important people — tag them Client. Learned
  // important contacts also read as Client (unless they're genuinely urgent below).
  if (isVip || isKnown) category = 'Client';
  // ...but a genuinely urgent message always shows as Urgent (highest priority).
  if (bucket === 'urgent') category = 'Urgent';

  // --- Explicit sender classification (the Classify button) — highest user intent.
  // Lets you teach the app how to treat a sender: a wanted contact, or junk/news.
  const senderLabel = (options.senderLabels || {})[sender.email] || null;
  if (senderLabel === 'junk') {
    category = 'Newsletter'; bucket = 'noise'; score -= 60; reasons.unshift('Marked junk');
  } else if (senderLabel === 'newsletter') {
    category = 'Newsletter'; bucket = 'noise'; score -= 25; reasons.unshift('Marked newsletter');
  } else if (senderLabel) {
    // Person/relationship labels: important, client, vendor, coworker, employee — a
    // real, wanted contact. Boost it, never bury it, and tag it sensibly.
    score += senderLabel === 'important' ? 50 : 25;
    if (bucket === 'noise' || bucket === 'fyi') bucket = 'important';
    if (senderLabel === 'client' || senderLabel === 'vendor') category = 'Client';
    if (bucket === 'urgent') category = 'Urgent';
    reasons.unshift(`Marked ${senderLabel}`);
  }

  // --- User-defined custom categories (sender maps + keyword rules) ---
  // A sender match is an explicit user choice and wins over everything; a keyword
  // match wins over the default tag but not over Urgent. We keep up to 3 tags.
  const customDefs = options.categories || [];
  let categoryColor = null;
  const extraTags = [];
  let senderCat = null;
  let keywordCat = null;
  for (const c of customDefs) {
    if (!c || !c.name) continue;
    const senderHit = (c.senders || []).some((s) => s && sender.email.includes(String(s).toLowerCase().trim()));
    const kwHit = (c.keywords || []).some((k) => k && haystack.includes(String(k).toLowerCase().trim()));
    if (senderHit) { senderCat = c; extraTags.push(c); }
    else if (kwHit) { keywordCat = keywordCat || c; extraTags.push(c); }
  }
  if (senderCat) { category = senderCat.name; categoryColor = senderCat.color || null; }
  else if (category !== 'Urgent' && keywordCat) { category = keywordCat.name; categoryColor = keywordCat.color || null; }

  // Up to 3 tags: the primary category first, then any other custom matches.
  const categories = [];
  const pushCat = (name, color) => { if (name && !categories.find((x) => x.name === name)) categories.push({ name, color: color || null }); };
  pushCat(category, categoryColor);
  extraTags.forEach((c) => pushCat(c.name, c.color));

  // Extra guard: a noisy/automated sender shouldn't be urgent either.
  if ((noisySender || noiseHits >= 2) && bucket === 'urgent' && !isVip && !isKnown) bucket = 'noise';

  // VIPs (and learned important contacts) never get buried in Noise/FYI — bump
  // them to at least Important.
  if ((isVip || isKnown) && (bucket === 'noise' || bucket === 'fyi')) bucket = 'important';

  return {
    score,
    rank: score10(score),                // a nuanced 1–10 urgency score
    bucket,
    category,
    categoryColor,                       // custom category color (null for the built-in 6)
    categories: categories.slice(0, 3),  // up to 3 tags (primary first)
    isVip,
    isKnown,                             // learned-important sender (not a hand-picked VIP)
    reason: reasons[0] || 'General message',
    reasons,
    senderName: sender.name,
    senderEmail: sender.email,
    // Prefer a real AI summary from the backend when present; otherwise summarize on-device.
    tldr: email.aiSummary || summarize(email.body || email.snippet || ''),
    // True only when the preview is a real AI TL;DR (so the UI shows the ✨ badge
    // only then — never on a raw body-preview fallback).
    aiSummarized: Boolean(email.aiSummary),
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
// categories = optional user-defined custom categories.
// knownImportant = lowercased sender emails the AI learned are important to you.
export function prioritize(rawEmails, vips = [], categories = [], knownImportant = [], senderLabels = {}) {
  return rawEmails
    .map((e) => ({ ...e, priority: scoreEmail(e, { vips, categories, knownImportant, senderLabels }) }))
    .sort((a, b) => {
      const ord =
        BUCKETS[a.priority.bucket].order - BUCKETS[b.priority.bucket].order;
      if (ord !== 0) return ord;
      return b.priority.score - a.priority.score;
    });
}
