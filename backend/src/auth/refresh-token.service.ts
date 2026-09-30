import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { AuditService, type AuditRequestContext } from '../audit';
import { CLOCK, MS_PER_SECOND, type Clock } from '../common/clock';
import { uuidv7 } from '../common/ids/uuidv7';
import { AppConfigService } from '../config/app-config.service';
import type { DbExecutor } from '../database/database.types';
import { RefreshTokenRepository } from './refresh-token.repository';
import type { IssuedRefreshToken, RotationResult } from './auth.types';
import { AUDIT_ENTITY_TYPES } from '../audit/audit.constants';
import { sha256Hex } from '../common/crypto/sha256';

const TOKEN_BYTES = 32;
// base64url of 32 bytes without padding is always exactly 43 characters.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** SHA-256 hex of a raw refresh token; the only form that is ever stored. */
export function hashRefreshToken(token: string): string {
  return sha256Hex(token);
}

/** True when the value has the exact shape of a token this server issues. */
export function isWellFormedRefreshToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/**
 * Refresh token families (SPEC 7.3): issue on login, rotate with reuse
 * detection, revoke on logout. A family is one login session; its id is the
 * `sid` claim of every access token minted from it.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Starts a new family. Pass the login transaction so it commits atomically. */
  async issue(
    userId: string,
    context: AuditRequestContext,
    executor?: DbExecutor,
  ): Promise<IssuedRefreshToken> {
    const now = this.clock.now();
    const familyId = uuidv7(now.getTime());
    const familyExpiresAt = new Date(
      now.getTime() +
        this.config.get('refreshFamilyTtlSeconds') * MS_PER_SECOND,
    );
    return this.insertToken(
      userId,
      familyId,
      familyExpiresAt,
      now,
      context,
      executor,
    );
  }

  /**
   * Exchanges a refresh token for its successor inside one transaction that
   * holds the family lock. A token that was already rotated or revoked is a
   * replay (the RFC 9700 s4.14.2 theft signal), so the whole family is
   * revoked. That branch returns instead of throwing so the revocation and
   * its audit event commit.
   */
  async rotate(
    rawToken: unknown,
    context: AuditRequestContext,
  ): Promise<RotationResult> {
    if (!isWellFormedRefreshToken(rawToken)) return { kind: 'invalid' };
    const tokenHash = hashRefreshToken(rawToken);
    const now = this.clock.now();

    return this.tokens.transaction(async (tx): Promise<RotationResult> => {
      const presented = await this.tokens.findByHash(tokenHash, tx);
      if (!presented) return { kind: 'invalid' };
      // Every change to a family (rotate, logout, reuse revoke) takes this
      // lock first and no other lock before it, so they run one at a time
      // and cannot deadlock. A revoke therefore never misses a successor.
      await this.tokens.lockFamily(tx, presented.familyId);
      // Read again under the lock: the first read may be out of date.
      const current = await this.tokens.findByHashForUpdate(tx, tokenHash);
      if (!current) return { kind: 'invalid' };

      if (current.revokedAt !== null || current.replacedBy !== null) {
        const revokedTokens = await this.tokens.revokeFamily(
          tx,
          current.familyId,
          now,
        );
        await this.audit.record(
          {
            action: 'REFRESH_TOKEN_REUSE_DETECTED',
            outcome: 'FAILURE',
            actorUserId: current.userId,
            entityType: AUDIT_ENTITY_TYPES.SESSION,
            entityId: current.familyId,
            metadata: { revokedTokens },
            context,
          },
          tx,
        );
        return { kind: 'reused' };
      }

      if (current.expiresAt <= now || current.familyExpiresAt <= now) {
        return { kind: 'expired' };
      }

      const successor = await this.insertToken(
        current.userId,
        current.familyId,
        current.familyExpiresAt,
        now,
        context,
        tx,
      );
      await this.tokens.markRotated(tx, current.id, successor.id, now);
      await this.audit.record(
        {
          action: 'TOKEN_REFRESHED',
          outcome: 'SUCCESS',
          actorUserId: current.userId,
          entityType: AUDIT_ENTITY_TYPES.SESSION,
          entityId: current.familyId,
          context,
        },
        tx,
      );
      return {
        kind: 'rotated',
        userId: current.userId,
        token: successor.token,
        familyId: successor.familyId,
        expiresAt: successor.expiresAt,
      };
    });
  }

  /**
   * Revokes the family of the presented token (logout). Unknown, malformed or
   * already revoked tokens are a silent no-op so logout stays idempotent. The
   * revoke and its audit event commit together in one transaction.
   */
  async revoke(rawToken: unknown, context: AuditRequestContext): Promise<void> {
    if (!isWellFormedRefreshToken(rawToken)) return;
    const current = await this.tokens.findByHash(hashRefreshToken(rawToken));
    if (!current) return;
    const now = this.clock.now();
    await this.tokens.transaction(async (tx) => {
      const revokedTokens = await this.tokens.revokeFamily(
        tx,
        current.familyId,
        now,
      );
      // Zero really means the session had already ended (revokeFamily waits
      // for any rotation in flight), and the logout or reuse detection that
      // ended it wrote its own event. A second LOGOUT would record an ending
      // that did not happen.
      if (revokedTokens === 0) return;
      await this.audit.record(
        {
          action: 'LOGOUT',
          outcome: 'SUCCESS',
          actorUserId: current.userId,
          entityType: AUDIT_ENTITY_TYPES.SESSION,
          entityId: current.familyId,
          metadata: { revokedTokens },
          context,
        },
        tx,
      );
    });
  }

  private async insertToken(
    userId: string,
    familyId: string,
    familyExpiresAt: Date,
    now: Date,
    context: AuditRequestContext,
    executor?: DbExecutor,
  ): Promise<IssuedRefreshToken & { id: string }> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const id = uuidv7(now.getTime());
    // Rotation never extends the session: a successor lives at most until the
    // family's absolute end.
    const expiresAt = new Date(
      Math.min(
        now.getTime() +
          this.config.get('refreshTokenTtlSeconds') * MS_PER_SECOND,
        familyExpiresAt.getTime(),
      ),
    );
    await this.tokens.insert(
      {
        id,
        userId,
        familyId,
        tokenHash: hashRefreshToken(token),
        expiresAt,
        familyExpiresAt,
        userAgent: context.userAgent ?? null,
        ip: context.ip && isIP(context.ip) ? context.ip : null,
      },
      executor,
    );
    return { id, token, familyId, expiresAt };
  }
}
