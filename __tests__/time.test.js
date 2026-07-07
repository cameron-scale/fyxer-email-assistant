// time.test.js — tests for the friendly relative-time labels.
import { timeAgo, dayBucket, nightlyArchiveEta } from '../src/lib/time';

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

describe('dayBucket', () => {
  it('buckets today', () => {
    expect(dayBucket(new Date().toISOString())).toBe('Today');
  });
  it('buckets the last 7 days', () => {
    expect(dayBucket(new Date(Date.now() - 3 * 86400000).toISOString())).toBe('Last 7 days');
  });
  it('buckets older mail as Earlier', () => {
    expect(dayBucket(new Date(Date.now() - 10 * 86400000).toISOString())).toBe('Earlier');
  });
});

describe('nightlyArchiveEta', () => {
  it('returns an hours or minutes countdown string', () => {
    expect(nightlyArchiveEta()).toMatch(/^\d+[hm]$/);
  });
});
