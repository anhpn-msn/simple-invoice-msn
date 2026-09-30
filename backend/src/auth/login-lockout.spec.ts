import { lockedUntilFor, lockoutSeconds } from './login-lockout';

describe('lockoutSeconds', () => {
  it('does not lock below the threshold', () => {
    expect([0, 1, 4].map((f) => lockoutSeconds(f, 5, 900))).toEqual([0, 0, 0]);
  });

  it('doubles from 30 s at the threshold and stops at the cap', () => {
    expect(
      [5, 6, 7, 8, 9, 10, 11, 40].map((f) => lockoutSeconds(f, 5, 900)),
    ).toEqual([30, 60, 120, 240, 480, 900, 900, 900]);
  });

  it('respects a configured threshold and cap', () => {
    expect(lockoutSeconds(3, 3, 45)).toBe(30);
    expect(lockoutSeconds(4, 3, 45)).toBe(45);
  });
});

describe('lockedUntilFor', () => {
  const now = new Date('2026-09-30T00:00:00.000Z');

  it('returns null when no lock applies', () => {
    expect(lockedUntilFor(4, now, 5, 900)).toBeNull();
  });

  it('adds the lock duration to now', () => {
    expect(lockedUntilFor(6, now, 5, 900)?.toISOString()).toBe(
      '2026-09-30T00:01:00.000Z',
    );
  });
});
