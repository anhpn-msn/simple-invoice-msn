export const ROLES = ['ACCOUNTANT', 'AUDITOR'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = ['invoice:read', 'invoice:create'] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Static role to permissions map (SPEC A-13). The only source of authorization. */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  ACCOUNTANT: ['invoice:read', 'invoice:create'],
  AUDITOR: ['invoice:read'],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
