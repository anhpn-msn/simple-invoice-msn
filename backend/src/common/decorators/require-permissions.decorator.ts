import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../auth/permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Requires the caller to hold every listed permission (checked by PermissionsGuard). */
export const RequirePermissions = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
