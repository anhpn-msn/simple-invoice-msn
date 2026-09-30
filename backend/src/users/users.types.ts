import type { Role } from '../common/auth/permissions';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullname: string;
  role: Role;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/**
 * Result of reserving a login attempt. `allowed: false` means the account is
 * locked right now and the password must not be checked.
 */
export type LoginAttemptReservation =
  | { allowed: false }
  | { allowed: true; attempts: number; lockedUntil: Date | null };

export type UserRow = Omit<UserRecord, 'role'> & { role: string };
