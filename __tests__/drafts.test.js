// drafts.test.js — tests for tone-matched reply suggestions.
import { suggestReplies } from '../src/lib/drafts';

const email = {
  subject: 'Can we schedule a call?',
  body: 'Hey, could we set up a meeting next week? Also can you approve the budget?',
  priority: { senderName: 'Marcus Lee' },
};

describe('suggestReplies', () => {
  it('returns at most three suggestions', () => {
    expect(suggestReplies(email).length).toBeLessThanOrEqual(3);
  });

  it('offers a meeting suggestion when the email asks to meet', () => {
    const labels = suggestReplies(email).map((s) => s.label);
    expect(labels).toContain('Suggest a time');
  });

  it('uses the chosen signature', () => {
    const [first] = suggestReplies(email, { signature: 'Cameron' });
    expect(first.text).toContain('Cameron');
  });

  it('changes wording with tone', () => {
    const pro = suggestReplies(email, { tone: 'professional' })[0].text;
    const friendly = suggestReplies(email, { tone: 'friendly' })[0].text;
    expect(pro).not.toEqual(friendly);
  });

  it('always provides a fallback acknowledge reply', () => {
    const labels = suggestReplies({ subject: 'fyi', body: 'no action', priority: { senderName: 'Sam' } }).map(
      (s) => s.label
    );
    expect(labels).toContain('Acknowledge');
  });
});
