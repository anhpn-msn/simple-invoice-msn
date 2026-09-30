import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService, requestContext } from '../../audit';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import type { Permission } from '../../common/auth/permissions';
import { AUTHENTICATED_ONLY_KEY } from '../../common/decorators/authenticated-only.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';

/**
 * Global authorization guard (SPEC 7.2). Runs after JwtAuthGuard and checks
 * @RequirePermissions against the static role map. It fails closed: a
 * non-public route needs @RequirePermissions or @AuthenticatedOnly(), else it
 * is denied. Denials are audited as ACCESS_DENIED (SPEC 9) and answered with
 * a plain 403.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_PUBLIC_KEY,
        targets,
      )
    ) {
      return true;
    }
    const declared = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    const required = declared ?? [];
    if (required.length === 0) {
      const authenticatedOnly = this.reflector.getAllAndOverride<
        boolean | undefined
      >(AUTHENTICATED_ONLY_KEY, targets);
      if (authenticatedOnly) return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthPrincipal }>();
    const principal = request.user;
    if (
      principal &&
      required.length > 0 &&
      required.every((p) => principal.permissions.includes(p))
    ) {
      return true;
    }

    await this.audit.record({
      action: 'ACCESS_DENIED',
      outcome: 'FAILURE',
      actorUserId: principal?.userId ?? null,
      metadata: {
        requiredPermissions: required,
        role: principal?.role ?? null,
        method: request.method,
        route: (request.route as { path?: unknown } | undefined)?.path ?? null,
      },
      context: requestContext(request),
    });
    throw new ForbiddenException('Forbidden resource');
  }
}
