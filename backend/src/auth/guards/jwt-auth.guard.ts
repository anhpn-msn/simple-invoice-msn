import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { permissionsForRole } from '../../common/auth/permissions';
import { CLOCK, type Clock } from '../../common/clock';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { HTTP_HEADERS } from '../../common/http/http-headers.constants';
import { BEARER_SCHEME } from '../auth.constants';
import { RefreshTokenRepository } from '../refresh-token.repository';
import { InvalidAccessTokenError, TokenService } from '../token.service';

const BEARER_PATTERN = new RegExp(
  `^${BEARER_SCHEME} ([A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+)$`,
);

/**
 * Global deny-by-default authentication (SPEC 7.2). Routes opt out with
 * @Public(). After the signature and claims check it runs one query that
 * loads the user only if the token's session (sid) is still live, so logout
 * and reuse detection cut off access tokens immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthPrincipal }>();
    const response = context.switchToHttp().getResponse<Response>();
    try {
      request.user = await this.authenticate(request.headers.authorization);
      return true;
    } catch (error) {
      if (!(error instanceof InvalidAccessTokenError)) throw error;
      // RFC 6750 s3: a 401 for a bearer-protected resource names the scheme.
      response.setHeader(HTTP_HEADERS.WWW_AUTHENTICATE, BEARER_SCHEME);
      throw new UnauthorizedException();
    }
  }

  private async authenticate(
    header: string | undefined,
  ): Promise<AuthPrincipal> {
    const match = header ? BEARER_PATTERN.exec(header) : null;
    if (!match) throw new InvalidAccessTokenError();
    const claims = await this.tokens.verifyAccessToken(match[1]);
    const user = await this.sessions.findActiveSessionUser(
      claims.sub,
      claims.sid,
      this.clock.now(),
    );
    if (!user) throw new InvalidAccessTokenError();
    // The role comes from the database, not the token, so a role change takes
    // effect on the next request.
    return {
      userId: user.id,
      sessionId: claims.sid,
      role: user.role,
      permissions: permissionsForRole(user.role),
    };
  }
}
