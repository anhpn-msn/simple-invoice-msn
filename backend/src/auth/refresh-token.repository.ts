import { Inject, Injectable } from '@nestjs/common';
import { and, eq, exists, gt, isNull, sql } from 'drizzle-orm';
import type { Role } from '../common/auth/permissions';
import { DRIZZLE } from '../database/database.module';
import type {
  Database,
  DbExecutor,
  Transaction,
} from '../database/database.types';
import { refreshTokens, users } from '../database/schema';
import { REFRESH_FAMILY_LOCK_NAMESPACE } from './auth.constants';
import type {
  NewRefreshToken,
  RefreshTokenRecord,
  SessionUser,
} from './auth.types';

const recordColumns = {
  id: refreshTokens.id,
  userId: refreshTokens.userId,
  familyId: refreshTokens.familyId,
  expiresAt: refreshTokens.expiresAt,
  familyExpiresAt: refreshTokens.familyExpiresAt,
  revokedAt: refreshTokens.revokedAt,
  replacedBy: refreshTokens.replacedBy,
};

/** Persistence for refresh tokens. Only SHA-256 hashes are ever stored. */
@Injectable()
export class RefreshTokenRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  async insert(
    token: NewRefreshToken,
    executor: DbExecutor = this.db,
  ): Promise<void> {
    await executor.insert(refreshTokens).values(token);
  }

  /** Locks the row so two concurrent refreshes of one token are serialized. */
  async findByHashForUpdate(
    tx: Transaction,
    tokenHash: string,
  ): Promise<RefreshTokenRecord | null> {
    const [row] = await tx
      .select(recordColumns)
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .for('update');
    return row ?? null;
  }

  async findByHash(
    tokenHash: string,
    executor: DbExecutor = this.db,
  ): Promise<RefreshTokenRecord | null> {
    const [row] = await executor
      .select(recordColumns)
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async markRotated(
    tx: Transaction,
    id: string,
    replacedBy: string,
    now: Date,
  ): Promise<void> {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: now, replacedBy })
      .where(eq(refreshTokens.id, id));
  }

  /**
   * Waits for, then holds until the transaction ends, the lock that every
   * change to one refresh family takes first. Taking it twice in one
   * transaction is fine: advisory locks are re-entrant per session.
   */
  async lockFamily(tx: Transaction, familyId: string): Promise<void> {
    // A hash collision between two families only makes them wait for each
    // other briefly; it can never let two changes of one family overlap.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${REFRESH_FAMILY_LOCK_NAMESPACE}::int, hashtext(${familyId}::text))`,
    );
  }

  /**
   * Revokes every still-active token of a family; returns how many changed.
   * Needs a transaction: the family lock it takes must stay held until the
   * revoke commits.
   */
  async revokeFamily(
    tx: Transaction,
    familyId: string,
    now: Date,
  ): Promise<number> {
    // Under READ COMMITTED one UPDATE cannot see a successor that an in-flight
    // rotation inserted, so it would leave that successor active (T12 M1).
    // Rotation inserts successors only while it holds the family lock, so
    // once we hold it no rotation of this family is in flight or can start
    // before we commit. The UPDATE runs after the lock as a new statement with
    // a fresh snapshot and sees every successor, so locking the rows first,
    // as an earlier version did, would add nothing.
    await this.lockFamily(tx, familyId);
    const revoked = await tx
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt),
        ),
      )
      .returning({ id: refreshTokens.id });
    return revoked.length;
  }

  /**
   * The per-request session check: one statement that returns the user only
   * if it exists AND its session (refresh family `sid`) still has a live,
   * non-revoked token inside the family's absolute lifetime. Probes the users
   * primary key and refresh_tokens_family_idx.
   */
  async findActiveSessionUser(
    userId: string,
    familyId: string,
    now: Date,
  ): Promise<SessionUser | null> {
    const [row] = await this.db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          exists(
            this.db
              .select({ one: sql`1` })
              .from(refreshTokens)
              .where(
                and(
                  eq(refreshTokens.familyId, familyId),
                  eq(refreshTokens.userId, users.id),
                  isNull(refreshTokens.revokedAt),
                  gt(refreshTokens.familyExpiresAt, now),
                ),
              ),
          ),
        ),
      )
      .limit(1);
    // users_role_check guarantees the stored value is a known role.
    return row ? { id: row.id, role: row.role as Role } : null;
  }
}
