import type { Permission, Role } from './permissions';

/**
 * The authenticated caller, attached to `request.user` by JwtAuthGuard and
 * read with `@CurrentUser()`.
 */
export interface AuthPrincipal {
  userId: string;
  /** Refresh token family id (the `sid` claim). */
  sessionId: string;
  role: Role;
  permissions: readonly Permission[];
}
