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
    expect(p.category).toBe('Action Needed');
  });

  it('never marks a promotional sender as urgent even with urgent words', () => {
    const p = scoreEmail(
      make({ from: 'Deals <offers@amazon.com>', subject: 'Sale ends today!', body: 'Limited time, shop now.' })
    );
    expect(p.bucket).toBe('noise');
    expect(p.category).toBe('Newsletter');
  });

  it('treats a brand/list "how-to" blast as a newsletter, not urgent', () => {
    const p = scoreEmail(make({
      from: 'Claude for HR Professionals <newsletter@hrpanel.com>',
      subject: 'Using Claude to Be More Productive as an HR Professional',
      body: 'How to get more done. Best practices and tips inside.',
    }));
    expect(p.bucket).not.toBe('urgent');
    expect(p.category).toBe('Newsletter');
  });

  it('does not let substrings (e.g. "now" in "knowledge") trigger urgency', () => {
    const p = scoreEmail(make({
      from: 'Pat Lee <pat@firm.com>',
      subject: 'Sharing some knowledge',
      body: 'Here is a rundown of what we know about the rollout.',
    }));
    expect(p.bucket).not.toBe('urgent');
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

describe('sender classification (Classify button)', () => {
  it('sends a junk-labeled sender to Newsletter/noise', () => {
    const email = make({ from: 'Bob <bob@acme.com>', subject: 'Important update', body: 'Please review.' });
    const labeled = scoreEmail(email, { senderLabels: { 'bob@acme.com': 'junk' } });
    expect(labeled.category).toBe('Newsletter');
    expect(labeled.bucket).toBe('noise');
  });

  it('lifts an important-labeled sender out of noise', () => {
    const email = make({ from: 'Newsy <news@blast.com>', subject: 'weekly digest', body: 'unsubscribe' });
    const normal = scoreEmail(email);
    const labeled = scoreEmail(email, { senderLabels: { 'news@blast.com': 'important' } });
    expect(labeled.score).toBeGreaterThan(normal.score);
    expect(['urgent', 'important']).toContain(labeled.bucket);
  });

  it('tags a client-labeled sender as Client', () => {
    const email = make({ from: 'Pat <pat@co.com>', subject: 'hi', body: 'checking in' });
    const labeled = scoreEmail(email, { senderLabels: { 'pat@co.com': 'client' } });
    expect(labeled.category).toBe('Client');
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
