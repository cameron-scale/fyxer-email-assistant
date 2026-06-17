// demoEmails.js
// Realistic sample inbox so the app is fun to use the instant you open it in Expo Go,
// before you connect a real account. These get run through the same priority engine
// as real mail, so you can see how sorting works.

const now = Date.now();
const mins = (m) => new Date(now - m * 60000).toISOString();

export const demoEmails = [
  {
    id: 'd1',
    account: 'demo',
    from: 'Priya Nair <priya.nair@northwind.com>',
    subject: 'URGENT: contract needs your signature before EOD',
    body:
      "Hi Cameron, legal just flagged that the Northwind contract has to be signed before end of day or we lose the Q3 rate. Can you review section 4 and sign? It's time sensitive — let me know the moment it's done.",
    date: mins(8),
    read: false,
    flagged: false,
  },
  {
    id: 'd2',
    account: 'demo',
    from: 'Stripe <notifications@stripe.com>',
    subject: 'Your payment to AWS failed',
    body:
      'Action required: a payment of $842.00 to Amazon Web Services failed because your card was declined. Please update your payment method to avoid service interruption.',
    date: mins(40),
    read: false,
    flagged: false,
  },
  {
    id: 'd3',
    account: 'demo',
    from: 'Marcus Lee <marcus@brightlabs.io>',
    subject: 'Can we move our call to Thursday?',
    body:
      "Hey Cameron, something came up Wednesday — could we reschedule our call to Thursday afternoon? Also, did you get a chance to look at the proposal I sent? Would love your feedback.",
    date: mins(95),
    read: false,
    flagged: false,
  },
  {
    id: 'd4',
    account: 'demo',
    from: 'Dana Whitfield <dana.w@scalembs.com>',
    subject: 'Approval needed: new vendor onboarding',
    body:
      'Hi Cameron, the new vendor paperwork is ready. Could you approve so we can kick off onboarding next week? Happy to walk you through it if useful.',
    date: mins(150),
    read: true,
    flagged: true,
  },
  {
    id: 'd5',
    account: 'demo',
    from: 'LinkedIn <messages-noreply@linkedin.com>',
    subject: 'You appeared in 9 searches this week',
    body:
      'See who has been looking at your profile. Upgrade to Premium to view all searchers. Manage your notification preferences anytime.',
    date: mins(220),
    read: false,
    flagged: false,
  },
  {
    id: 'd6',
    account: 'demo',
    from: 'Jordan Patel <jordan@maplecreative.co>',
    subject: 'Quick question about the invoice',
    body:
      'Hi Cameron — quick one: should invoice #2042 be billed to the parent company or the subsidiary? Want to make sure it goes to the right place before I send it.',
    date: mins(300),
    read: false,
    flagged: false,
  },
  {
    id: 'd7',
    account: 'demo',
    from: 'The Hustle <newsletter@thehustle.co>',
    subject: '🔥 The weekly recap: 5 trends you missed',
    body:
      "This week's digest: AI startups, market moves and more. View in browser. Unsubscribe at any time if you no longer wish to receive this newsletter.",
    date: mins(360),
    read: false,
    flagged: false,
  },
  {
    id: 'd8',
    account: 'demo',
    from: 'Sofia Romano <sofia@romano-design.com>',
    subject: 'Thank you!',
    body:
      'Just wanted to say thanks for the intro to your team yesterday — it really helped. No need to reply, just appreciated it!',
    date: mins(520),
    read: true,
    flagged: false,
  },
  {
    id: 'd9',
    account: 'demo',
    from: 'GitHub <noreply@github.com>',
    subject: '[brisk] CI run passed on main',
    body:
      'All checks have passed for your latest push. This is an automated notification. Manage your notification settings on github.com.',
    date: mins(610),
    read: true,
    flagged: false,
  },
  {
    id: 'd10',
    account: 'demo',
    from: 'Amazon <offers@amazon.com>',
    subject: 'Lightning deal: 30% off, today only',
    body:
      "Don't miss out! Limited time promotional offer — 30% off select items, today only. Shop now before it expires. Unsubscribe to stop promotional emails.",
    date: mins(700),
    read: false,
    flagged: false,
  },
];
