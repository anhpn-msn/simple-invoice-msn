import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService, type AuditRequestContext } from '../audit';
import type { AuthPrincipal } from '../common/auth/auth.types';
import { permissionsForRole } from '../common/auth/permissions';
import { CLOCK, type Clock } from '../common/clock';
import { AppConfigService } from '../config/app-config.service';
import { DRIZZLE } from '../database/database.module';
import type { Database } from '../database/database.types';
import { UsersRepository } from '../users/users.repository';
import type { UserRecord } from '../users/users.types';
import type { AuthUserDto } from './dto/auth-response.dto';
import { lockedUntilFor } from './login-lockout';
import { normalizeEmail } from './normalize-email';
import { PasswordHasher } from './password-hasher';
import { RefreshTokenService } from './refresh-token.service';
import { TokenService } from './token.service';
import type { AuthSession, LoginFailureReason } from './auth.types';
import { AUDIT_ENTITY_TYPES } from '../audit/audit.constants';
import { sha256Hex } from '../common/crypto/sha256';
import { BEARER_SCHEME } from './auth.constants';

export const INVALID_CREDENTIALS = 'Invalid email or password';

/** Login, refresh, logout and profile flows (SPEC 6.1 to 6.4, 7.2 to 7.4). */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Every failure path answers with the same 401 and pays one bcrypt compare,
   * so neither the message nor the timing tells an attacker whether the email
   * exists or the account is locked.
   */
  async login(
    email: string,
    password: string,
    context: AuditRequestContext,
  ): Promise<AuthSession> {
    const normalized = normalizeEmail(email);
    const emailHash = sha256Hex(normalized);
    const now = this.clock.now();

    const user = await this.users.findByEmail(normalized);
    if (!user) {
      await this.hasher.verify(password, null);
      return this.failLogin('UNKNOWN_USER', emailHash, context);
    }

    const reservation = await this.users.reserveLoginAttempt(
      user.id,
      now,
      (attempts) =>
        lockedUntilFor(
          attempts,
          now,
          this.config.get('loginMaxFailedAttempts'),
          this.config.get('loginLockoutMaxSeconds'),
        ),
    );
    if (!reservation.allowed) {
      await this.hasher.verify(password, null);
      return this.failLogin('LOCKED', emailHash, context, user.id);
    }

    if (!(await this.hasher.verify(password, user.passwordHash))) {
      if (reservation.lockedUntil) {
        await this.audit.record({
          action: 'ACCOUNT_LOCKED',
          outcome: 'FAILURE',
          actorUserId: user.id,
          entityType: AUDIT_ENTITY_TYPES.USER,
          entityId: user.id,
          metadata: {
            failedAttempts: reservation.attempts,
            lockedUntil: reservation.lockedUntil.toISOString(),
          },
          context,
        });
      }
      return this.failLogin(
        'BAD_PASSWORD',
        emailHash,
        context,
        user.id,
        reservation.attempts,
      );
    }

    const refresh = await this.db.transaction(async (tx) => {
      await this.users.resetLoginFailures(user.id, now, tx);
      const issued = await this.refreshTokens.issue(user.id, context, tx);
      await this.audit.record(
        {
          action: 'LOGIN_SUCCEEDED',
          outcome: 'SUCCESS',
          actorUserId: user.id,
          entityType: AUDIT_ENTITY_TYPES.SESSION,
          entityId: issued.familyId,
          context,
        },
        tx,
      );
      return issued;
    });

    return this.buildSession(
      user,
      refresh.familyId,
      refresh.token,
      refresh.expiresAt,
    );
  }

  /** Rotates the refresh token (SPEC 6.2). Any non-rotation outcome is a 401. */
  async refresh(
    rawToken: unknown,
    context: AuditRequestContext,
  ): Promise<AuthSession> {
    const result = await this.refreshTokens.rotate(rawToken, context);
    if (result.kind !== 'rotated') throw new UnauthorizedException();
    const user = await this.users.findById(result.userId);
    if (!user) throw new UnauthorizedException();
    return this.buildSession(
      user,
      result.familyId,
      result.token,
      result.expiresAt,
    );
  }

  /** Revokes the session behind the cookie (SPEC 6.3). Idempotent. */
  logout(rawToken: unknown, context: AuditRequestContext): Promise<void> {
    return this.refreshTokens.revoke(rawToken, context);
  }

  /** The current user's profile for GET /auth/me. */
  async getProfile(principal: AuthPrincipal): Promise<AuthUserDto> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new UnauthorizedException();
    return toAuthUser(user);
  }

  private async buildSession(
    user: UserRecord,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<AuthSession> {
    const accessToken = await this.tokens.signAccessToken({
      userId: user.id,
      sessionId,
      role: user.role,
    });
    return {
      body: {
        accessToken,
        tokenType: BEARER_SCHEME,
        expiresIn: this.tokens.accessTokenTtlSeconds,
        user: toAuthUser(user),
      },
      refreshToken,
      refreshExpiresAt,
    };
  }

  private async failLogin(
    reason: LoginFailureReason,
    emailHash: string,
    context: AuditRequestContext,
    userId?: string,
    failedAttempts?: number,
  ): Promise<never> {
    await this.audit.record({
      action: 'LOGIN_FAILED',
      outcome: 'FAILURE',
      actorUserId: userId ?? null,
      metadata: {
        reason,
        emailHash,
        ...(failedAttempts === undefined ? {} : { failedAttempts }),
      },
      context,
    });
    throw new UnauthorizedException(INVALID_CREDENTIALS);
  }
}

function toAuthUser(user: UserRecord): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    fullname: user.fullname,
    role: user.role,
    permissions: [...permissionsForRole(user.role)],
  };
}
