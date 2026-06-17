// time.test.js — tests for the friendly relative-time labels.
import { timeAgo } from '../src/lib/time';

describe('timeAgo', () => {
  it('shows "now" for very recent times', () => {
    expect(timeAgo(new Date().toISOString())).toBe('now');
  });

  it('shows minutes', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5m');
  });

  it('shows hours', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3600000).toISOString())).toBe('3h');
  });

  it('shows "Yesterday"', () => {
    expect(timeAgo(new Date(Date.now() - 26 * 3600000).toISOString())).toBe('Yesterday');
  });

  it('returns empty for an invalid date', () => {
    expect(timeAgo('not-a-date')).toBe('');
  });
});
