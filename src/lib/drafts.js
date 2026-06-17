// drafts.js
// Generates quick, sensible reply drafts you can tap to use. No AI service needed —
// these are smart templates based on what the email looks like. Easy to extend.

import { summarize } from './priority';

function firstName(name = '') {
  const n = name.trim().split(/\s+/)[0];
  if (!n) return 'there';
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// Returns an array of { label, text } suggestions, best first.
export function suggestReplies(email) {
  const name = firstName(email.priority?.senderName || '');
  const text = `${email.subject} ${email.body || ''}`.toLowerCase();
  const sign = '\n\nBest,\nCameron';
  const out = [];

  const wantsMeeting = /(meeting|call|schedule|catch up|chat|sync)/.test(text);
  const wantsApproval = /(approve|sign|review|confirm|sign-off|sign off)/.test(text);
  const isQuestion = email.body?.includes('?') || /\?/.test(email.subject || '');

  if (wantsMeeting) {
    out.push({
      label: 'Suggest a time',
      text: `Hi ${name},\n\nHappy to meet. Does Tuesday or Thursday afternoon work for you? Send a window that suits and I'll lock it in.${sign}`,
    });
  }
  if (wantsApproval) {
    out.push({
      label: 'Approve',
      text: `Hi ${name},\n\nLooks good to me — you're approved to proceed. Let me know if you need anything else from my side.${sign}`,
    });
  }
  if (isQuestion) {
    out.push({
      label: 'Answer shortly',
      text: `Hi ${name},\n\nGood question — short answer: yes. I'll follow up with the details shortly.${sign}`,
    });
  }

  // Always-available fallbacks.
  out.push({
    label: 'Acknowledge',
    text: `Hi ${name},\n\nThanks for this — got it and I'll take a look. I'll circle back soon.${sign}`,
  });
  out.push({
    label: 'Need more time',
    text: `Hi ${name},\n\nThanks for the note. I'm a little tied up right now — can I get back to you on this by end of week?${sign}`,
  });

  // De-duplicate by label, cap at 3.
  const seen = new Set();
  return out.filter((s) => !seen.has(s.label) && seen.add(s.label)).slice(0, 3);
}

// A tiny "what's this email about" helper for the detail screen.
export function explain(email) {
  return summarize(email.body || email.snippet || '', 220);
}
