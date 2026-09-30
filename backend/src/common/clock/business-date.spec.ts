import { toBusinessDate } from './business-date';

describe('toBusinessDate', () => {
  const instant = new Date('2026-09-30T16:30:00Z');

  it('is 2026-09-30 in UTC', () => {
    expect(toBusinessDate(instant, 'UTC')).toBe('2026-09-30');
  });

  it('is already 2026-10-01 in Asia/Singapore (UTC+8)', () => {
    expect(toBusinessDate(instant, 'Asia/Singapore')).toBe('2026-10-01');
  });

  it('is still 2026-09-30 in America/New_York (UTC-4)', () => {
    expect(toBusinessDate(instant, 'America/New_York')).toBe('2026-09-30');
  });

  it('flips exactly at local midnight', () => {
    expect(
      toBusinessDate(new Date('2026-09-30T15:59:59Z'), 'Asia/Singapore'),
    ).toBe('2026-09-30');
    expect(
      toBusinessDate(new Date('2026-09-30T16:00:00Z'), 'Asia/Singapore'),
    ).toBe('2026-10-01');
  });

  it('handles year boundary and zero padding', () => {
    expect(toBusinessDate(new Date('2025-12-31T23:00:00Z'), 'Asia/Tokyo')).toBe(
      '2026-01-01',
    );
    expect(toBusinessDate(new Date('2026-03-05T12:00:00Z'), 'UTC')).toBe(
      '2026-03-05',
    );
  });

  it('respects daylight saving offsets (Sydney)', () => {
    expect(
      toBusinessDate(new Date('2026-09-30T14:30:00Z'), 'Australia/Sydney'),
    ).toBe('2026-10-01');
    expect(
      toBusinessDate(new Date('2026-06-30T13:30:00Z'), 'Australia/Sydney'),
    ).toBe('2026-06-30');
    expect(
      toBusinessDate(new Date('2026-06-30T14:30:00Z'), 'Australia/Sydney'),
    ).toBe('2026-07-01');
  });

  it('throws RangeError for an unknown time zone', () => {
    expect(() => toBusinessDate(instant, 'Mars/Olympus')).toThrow(RangeError);
  });

  it('throws RangeError for an invalid date', () => {
    expect(() => toBusinessDate(new Date('nope'), 'UTC')).toThrow(RangeError);
  });
});
