// priority.test.js — tests for the "brain" that ranks and labels emails.
import { scoreEmail, prioritize, parseSender, summarize } from '../src/lib/priority';

const make = (over = {}) => ({
  id: 'x',
  from: 'Jane Doe <jane@acme.com>',
  subject: 'Hello',
  body: 'Just checking in.',
  read: false,
  flagged: false,
  ...over,
});

describe('parseSender', () => {
  it('pulls a name and email out of a From header', () => {
    expect(parseSender('Jane Doe <jane@acme.com>')).toEqual({
      name: 'Jane Doe',
      email: 'jane@acme.com',
    });
  });

  it('handles a bare email address', () => {
    const s = parseSender('bob@example.com');
    expect(s.email).toBe('bob@example.com');
  });
});

describe('summarize', () => {
  it('strips HTML and trims to one line', () => {
    const out = summarize('<p>Hi there, this is a longer sentence to summarize.</p>');
    expect(out).not.toMatch(/</);
    expect(out.length).toBeLessThanOrEqual(111);
  });

  it('never returns empty', () => {
    expect(summarize('')).toBeTruthy();
  });
});

describe('scoreEmail buckets', () => {
  it('flags an urgent deadline email as urgent', () => {
    const p = scoreEmail(make({ subject: 'URGENT: contract due EOD', body: 'Time sensitive.' }));
    expect(p.bucket).toBe('urgent');
  });

  it('sends newsletters/promotions to noise', () => {
    const p = scoreEmail(
      make({ from: 'News <newsletter@thehustle.co>', subject: 'Weekly digest', body: 'Unsubscribe anytime.' })
    );
    expect(p.bucket).toBe('noise');
  });

  it('treats a real person asking a question as needs-attention', () => {
    const p = scoreEmail(make({ subject: 'Quick question?', body: 'Can you confirm the date?' }));
    expect(['urgent', 'important', 'fyi']).toContain(p.bucket);
    expect(p.category).toBe('To Respond');
  });

  it('never marks a promotional sender as urgent even with urgent words', () => {
    const p = scoreEmail(
      make({ from: 'Deals <offers@amazon.com>', subject: 'Sale ends today!', body: 'Limited time, shop now.' })
    );
    expect(p.bucket).toBe('noise');
    expect(p.category).toBe('Promotions');
  });
});

describe('VIP boosting', () => {
  it('lifts a VIP sender out of noise/fyi to at least important', () => {
    const email = make({ from: 'Sam VIP <sam@vip.com>', subject: 'fyi', body: 'thanks!' });
    const normal = scoreEmail(email);
    const boosted = scoreEmail(email, { vips: ['sam@vip.com'] });
    expect(boosted.isVip).toBe(true);
    expect(boosted.score).toBeGreaterThan(normal.score);
    expect(['urgent', 'important']).toContain(boosted.bucket);
  });
});

describe('prioritize', () => {
  it('sorts urgent above noise and is stable', () => {
    const list = prioritize([
      make({ id: 'n', from: 'x <noreply@x.com>', subject: 'newsletter', body: 'unsubscribe' }),
      make({ id: 'u', subject: 'URGENT asap', body: 'deadline today' }),
    ]);
    expect(list[0].id).toBe('u');
    expect(list[list.length - 1].id).toBe('n');
  });

  it('puts a VIP ahead of an ordinary important email', () => {
    const list = prioritize(
      [
        make({ id: 'imp', subject: 'Please review the proposal', body: 'Need your feedback.' }),
        make({ id: 'vip', from: 'Boss <boss@co.com>', subject: 'hi', body: 'quick note' }),
      ],
      ['boss@co.com']
    );
    expect(list[0].id).toBe('vip');
  });
});
