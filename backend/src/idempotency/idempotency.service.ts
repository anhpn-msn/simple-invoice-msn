import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { CLOCK, MS_PER_SECOND } from '../common/clock';
import type { Clock } from '../common/clock';
import { AppConfigService } from '../config/app-config.service';
import type { Transaction } from '../database/database.types';
import { idempotencyKeys } from '../database/schema';
import { canonicalJson } from './canonical-json';
import type {
  IdempotencyRequest,
  IdempotencyBegin,
  StoredResponse,
} from './idempotency.types';
import { sha256Hex } from '../common/crypto/sha256';

export const IDEMPOTENCY_PAYLOAD_MISMATCH =
  'Idempotency-Key has already been used with a different request payload';

/**
 * Transaction-scoped idempotency (SPEC 7.6). The key row and the business rows
 * commit or roll back together, so a crash can never leave an orphaned
 * "in progress" key and a failed attempt releases the key for a corrected retry.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: AppConfigService,
  ) {}

  /**
   * SHA-256 over method, path and the canonical JSON of the validated body
   * (not the raw bytes), so key order or whitespace never causes a false 422.
   */
  fingerprint(method: string, path: string, body: unknown): string {
    return sha256Hex(
      `${method.toUpperCase()}\n${path}\n${canonicalJson(body)}`,
    );
  }

  /**
   * Claims the key inside the caller's transaction. A concurrent transaction
   * using the same key blocks on the primary key until the first one ends,
   * then takes the replay path (or claims the key itself if the first rolled
   * back). Throws 422 when the key was used with a different payload.
   */
  async begin(
    tx: Transaction,
    request: IdempotencyRequest,
  ): Promise<IdempotencyBegin> {
    const now = this.clock.now();
    const expiresAt = new Date(
      now.getTime() + this.config.get('idempotencyTtlSeconds') * MS_PER_SECOND,
    );
    const claim = {
      userId: request.userId,
      idempotencyKey: request.key,
      requestMethod: request.method,
      requestPath: request.path,
      requestHash: request.requestHash,
      responseStatus: 0,
      // Drizzle turns a JS null into SQL NULL, which the NOT NULL column rejects.
      responseBody: {},
      createdAt: now,
      expiresAt,
    };

    // DO UPDATE ... WHERE reclaims an expired key in the same atomic statement,
    // so two requests cannot both "delete then insert" the same stale key.
    const claimed = await tx
      .insert(idempotencyKeys)
      .values(claim)
      .onConflictDoUpdate({
        target: [idempotencyKeys.userId, idempotencyKeys.idempotencyKey],
        set: claim,
        setWhere: lt(idempotencyKeys.expiresAt, now),
      })
      .returning({ userId: idempotencyKeys.userId });
    if (claimed.length > 0) return { kind: 'new' };

    const [existing] = await tx
      .select({
        requestHash: idempotencyKeys.requestHash,
        responseStatus: idempotencyKeys.responseStatus,
        responseBody: idempotencyKeys.responseBody,
      })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, request.userId),
          eq(idempotencyKeys.idempotencyKey, request.key),
        ),
      );
    if (!existing) {
      throw new Error('Idempotency key vanished after a conflicting insert');
    }
    if (existing.requestHash !== request.requestHash) {
      throw new UnprocessableEntityException(IDEMPOTENCY_PAYLOAD_MISMATCH);
    }
    return {
      kind: 'replay',
      response: {
        status: existing.responseStatus,
        body: existing.responseBody,
      },
    };
  }

  /** Stores the final response on the key row, inside the same transaction. */
  async complete(
    tx: Transaction,
    request: Pick<IdempotencyRequest, 'userId' | 'key'>,
    response: StoredResponse,
  ): Promise<void> {
    await tx
      .update(idempotencyKeys)
      .set({
        responseStatus: response.status,
        responseBody: response.body,
      })
      .where(
        and(
          eq(idempotencyKeys.userId, request.userId),
          eq(idempotencyKeys.idempotencyKey, request.key),
        ),
      );
  }
}
