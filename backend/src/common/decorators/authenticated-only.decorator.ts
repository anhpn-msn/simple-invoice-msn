import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATED_ONLY_KEY = 'authenticatedOnly';

/**
 * Explicit marker for a non-public route that any signed-in user may call and
 * that needs no permission. PermissionsGuard denies a non-public route that
 * has neither this marker nor @RequirePermissions, so a forgotten decorator
 * fails closed instead of opening the route to every role.
 */
export const AuthenticatedOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_ONLY_KEY, true);
