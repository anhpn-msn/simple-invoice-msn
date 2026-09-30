import { MS_PER_SECOND } from '../common/clock/clock.constants';

/** First lock duration once the failure threshold is reached (SPEC 7.4). */
export const LOCKOUT_BASE_SECONDS = 30;

/**
 * Progressive per-account lock duration: 0 below the threshold, then
 * `min(30 s * 2^(failures - maxAttempts), capSeconds)`. With the defaults
 * (5, 900) that is 30, 60, 120, 240, 480, then 900 s.
 */
export function lockoutSeconds(
  failures: number,
  maxAttempts: number,
  capSeconds: number,
): number {
  if (failures < maxAttempts) return 0;
  return Math.min(
    LOCKOUT_BASE_SECONDS * 2 ** (failures - maxAttempts),
    capSeconds,
  );
}

/** Lock end for the given attempt count, or null when no lock applies. */
export function lockedUntilFor(
  failures: number,
  now: Date,
  maxAttempts: number,
  capSeconds: number,
): Date | null {
  const seconds = lockoutSeconds(failures, maxAttempts, capSeconds);
  return seconds > 0 ? new Date(now.getTime() + seconds * MS_PER_SECOND) : null;
}
