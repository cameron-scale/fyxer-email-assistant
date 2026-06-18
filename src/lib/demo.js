// demo.js — fake, non-personal inbox shown ONLY during the first-launch tutorial.
// Each email carries a precomputed `priority` (so the cards look real) and an
// explicit `band` (so the colors match the tutorial copy exactly), plus an
// `aiSummary` TL;DR the tour highlights as the AI summary feature.

function mk({ id, name, email, subject, body, category, band, tldr, hoursAgo, bucket = 'fyi' }) {
  return {
    id,
    account: 'demo',
    demo: true,
    from: `${name} <${email}>`,
    subject,
    body,
    aiSummary: tldr,
    date: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
    read: false,
    flagged: false,
    band, // explicit band so demo colors match the tutorial copy
    priority: {
      score: 50, bucket, category, categoryColor: band.tagColor,
      categories: [{ name: category, color: band.tagColor }],
      isVip: false, reason: 'Demo email', reasons: ['Demo email'],
      senderName: name, senderEmail: email, tldr,
    },
  };
}

const RED = { grad: ['#E5484D', '#B91C1C'], tagBg: '#FEECEC', tagColor: '#D32F2F', label: 'Urgent' };
const INDIGO = { grad: ['#4338CA', '#312E81'], tagBg: '#EEF2FF', tagColor: '#4338CA', label: 'Meeting' };
const TEAL = { grad: ['#0891B2', '#164E63'], tagBg: '#E8F6FA', tagColor: '#0891B2', label: 'Newsletter' };
const CLIENT = { grad: ['#1D4ED8', '#1E3A8A'], tagBg: '#E7EFFE', tagColor: '#1D4ED8', label: 'Client' };
const BLUE = { grad: ['#0071E3', '#0055B3'], tagBg: '#EAF3FF', tagColor: '#0071E3', label: 'To Respond' };
const EMERALD = { grad: ['#059669', '#065F46'], tagBg: '#E8F8F1', tagColor: '#059669', label: 'Finance' };

export const DEMO_EMAILS = [
  mk({ id: 'demo-1', name: 'Sarah Chen', email: 'sarah.chen@northwind.com', subject: 'Q2 Revenue Report — Needs Your Sign-off',
    category: 'Urgent', band: RED, bucket: 'urgent', hoursAgo: 1,
    tldr: 'Board approval needed on Q2 numbers before Friday.',
    body: 'Hi,\n\nThe Q2 revenue report is finalized and needs your sign-off before the board meeting on Friday. Please review the attached numbers and confirm.\n\nThanks,\nSarah' }),
  mk({ id: 'demo-2', name: 'James Whitfield', email: 'james@whitfield.partners', subject: 'Partnership Call — Thursday 2pm',
    category: 'Meeting', band: INDIGO, bucket: 'important', hoursAgo: 3,
    tldr: 'Call confirmed for Thursday, Zoom link coming one hour before.',
    body: 'Hi,\n\nConfirming our partnership call for Thursday at 2pm. I will send the Zoom link about an hour before we start.\n\nBest,\nJames' }),
  mk({ id: 'demo-3', name: 'Notion', email: 'team@notion.so', subject: 'Your workspace is ready to explore',
    category: 'Newsletter', band: TEAL, bucket: 'noise', hoursAgo: 6,
    tldr: 'Getting started guide for your new Notion workspace.',
    body: 'Welcome to Notion! Your workspace is ready. Here is a quick getting-started guide to help you explore.' }),
  mk({ id: 'demo-4', name: 'Marcus Lee', email: 'marcus@brightlabs.io', subject: 'Re: Proposal Draft — Final Version',
    category: 'Client', band: CLIENT, bucket: 'important', hoursAgo: 5,
    tldr: 'Approved overall — asks to soften pricing language on page 4.',
    body: 'Hi,\n\nThe proposal looks great overall and we are approved to move ahead. One note: could you soften the pricing language on page 4?\n\nThanks,\nMarcus' }),
  mk({ id: 'demo-5', name: 'Alex Rivera', email: 'alex.rivera@gmail.com', subject: 'Lunch tomorrow?',
    category: 'To Respond', band: BLUE, bucket: 'fyi', hoursAgo: 8,
    tldr: "Wants to know if you're free for lunch noon tomorrow.",
    body: 'Hey! Are you free for lunch around noon tomorrow? Would love to catch up.' }),
  mk({ id: 'demo-6', name: 'Finance Team', email: 'finance@northwind.com', subject: 'Invoice #4821 approved — payment processing',
    category: 'Finance', band: EMERALD, bucket: 'fyi', hoursAgo: 12,
    tldr: '$3,400 payment approved and processing, arrives in 2 to 3 days.',
    body: 'Invoice #4821 for $3,400 has been approved and payment is processing. Funds should arrive in 2 to 3 business days.' }),
];

export const DEMO_URGENT_ID = 'demo-1';
