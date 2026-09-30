import { ROLE_PERMISSIONS, permissionsForRole } from './permissions';

describe('ROLE_PERMISSIONS', () => {
  it('lets accountants read and create', () => {
    expect(permissionsForRole('ACCOUNTANT')).toEqual([
      'invoice:read',
      'invoice:create',
    ]);
  });

  it('lets auditors only read', () => {
    expect(ROLE_PERMISSIONS.AUDITOR).toEqual(['invoice:read']);
  });
});
