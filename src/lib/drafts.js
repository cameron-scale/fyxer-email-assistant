// drafts.js
// Generates quick, sensible reply drafts you can tap to use. No AI service needed —
// these are smart templates that adapt to (a) what the email is asking and
// (b) the TONE you choose (Professional / Friendly / Brief), plus your signature.
// Easy to extend: add new intents or tweak the wording per tone below.

import { summarize } from './priority';

function firstName(name = '') {
  const n = name.trim().split(/\s+/)[0];
  if (!n) return 'there';
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// Greeting + sign-off vary by tone so replies sound like a real person, not a robot.
const TONE = {
  professional: {
    hi: (n) => `Hi ${n},`,
    sign: (s) => `\n\nBest regards,\n${s}`,
  },
  friendly: {
    hi: (n) => `Hey ${n}! 👋`,
    sign: (s) => `\n\nThanks so much,\n${s}`,
  },
  brief: {
    hi: (n) => `Hi ${n},`,
    sign: (s) => `\n\n– ${s}`,
  },
};

// Body text for each intent, written three ways (one per tone).
const BODIES = {
  meeting: {
    professional: "Happy to meet. Would Tuesday or Thursday afternoon suit you? Send a window that works and I'll confirm.",
    friendly: "Yes, let's do it! Does Tue or Thu afternoon work for you? Throw me a time and I'll lock it in. 🙂",
    brief: 'Works for me. Tue or Thu afternoon? Send a time.',
  },
  approve: {
    professional: "This looks good to me — you're approved to proceed. Let me know if you need anything further from my side.",
    friendly: 'Looks great — all good from me, go for it! Shout if you need anything else.',
    brief: 'Approved — go ahead.',
  },
  answer: {
    professional: 'Good question. The short answer is yes; I will follow up with the details shortly.',
    friendly: "Great question! Short answer: yes 🙌 — I'll send the details in a bit.",
    brief: 'Short answer: yes. Details to follow.',
  },
  ack: {
    professional: "Thank you for this — I've received it and will take a look, then circle back soon.",
    friendly: 'Thanks for this! Got it — will take a look and get back to you soon. 🙏',
    brief: 'Got it, thanks. Will review and revert.',
  },
  later: {
    professional: "Thank you for the note. I'm a little tied up at the moment — may I get back to you on this by end of week?",
    friendly: "Thanks for the nudge! I'm a bit slammed right now — okay if I come back to you by Friday?",
    brief: 'Thanks — bit busy now. Will reply by Friday.',
  },
};

// Returns an array of { label, text } suggestions, best first.
export function suggestReplies(email, opts = {}) {
  const tone = TONE[opts.tone] ? opts.tone : 'professional';
  const signature = opts.signature || 'Cameron';
  const t = TONE[tone];
  const name = firstName(email.priority?.senderName || '');
  const make = (intent) => `${t.hi(name)}\n\n${BODIES[intent][tone]}${t.sign(signature)}`;

  const text = `${email.subject} ${email.body || ''}`.toLowerCase();
  const wantsMeeting = /(meeting|call|schedule|catch up|chat|sync)/.test(text);
  const wantsApproval = /(approve|sign|review|confirm|sign-off|sign off)/.test(text);
  const isQuestion = email.body?.includes('?') || /\?/.test(email.subject || '');

  const out = [];
  if (wantsMeeting) out.push({ label: 'Suggest a time', text: make('meeting') });
  if (wantsApproval) out.push({ label: 'Approve', text: make('approve') });
  if (isQuestion) out.push({ label: 'Answer shortly', text: make('answer') });
  out.push({ label: 'Acknowledge', text: make('ack') });
  out.push({ label: 'Need more time', text: make('later') });

  const seen = new Set();
  return out.filter((s) => !seen.has(s.label) && seen.add(s.label)).slice(0, 3);
}

// A tiny "what's this email about" helper for the detail screen.
export function explain(email) {
  return summarize(email.body || email.snippet || '', 220);
}
