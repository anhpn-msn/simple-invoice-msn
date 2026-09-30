import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Role } from '../common/auth/permissions';
import { DRIZZLE } from '../database/database.module';
import type { Database, DbExecutor } from '../database/database.types';
import { users } from '../database/schema';
import type {
  UserRecord,
  LoginAttemptReservation,
  UserRow,
} from './users.types';

const userColumns = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  fullname: users.fullname,
  role: users.role,
  failedLoginCount: users.failedLoginCount,
  lockedUntil: users.lockedUntil,
};

// The users_role_check constraint guarantees the value is a known role.
const toRecord = (row: UserRow): UserRecord => ({
  ...row,
  role: row.role as Role,
});

@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Looks a user up by an already normalized (trimmed, lowercased) email. */
  async findByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select(userColumns)
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select(userColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? toRecord(row) : null;
  }

  /**
   * Counts a login attempt BEFORE the password is checked, and sets the lock
   * in the same row-locked transaction when the new count reaches the
   * threshold. Concurrent attempts queue on the row lock and then see the
   * lock, so a parallel burst cannot get more guesses than the policy allows.
   * `lockUntilFor` maps the new attempt count to a lock end (or null).
   */
  async reserveLoginAttempt(
    userId: string,
    now: Date,
    lockUntilFor: (attempts: number) => Date | null,
  ): Promise<LoginAttemptReservation> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          failedLoginCount: users.failedLoginCount,
          lockedUntil: users.lockedUntil,
        })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!row) return { allowed: false };
      if (row.lockedUntil !== null && row.lockedUntil > now) {
        return { allowed: false };
      }
      const attempts = row.failedLoginCount + 1;
      const lockedUntil = lockUntilFor(attempts);
      await tx
        .update(users)
        .set({ failedLoginCount: attempts, lockedUntil, updatedAt: now })
        .where(eq(users.id, userId));
      return { allowed: true, attempts, lockedUntil };
    });
  }

  /** Clears the failure counter and any lock after a successful login. */
  async resetLoginFailures(
    userId: string,
    now: Date,
    executor: DbExecutor = this.db,
  ): Promise<void> {
    await executor
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: now })
      .where(eq(users.id, userId));
  }
}
