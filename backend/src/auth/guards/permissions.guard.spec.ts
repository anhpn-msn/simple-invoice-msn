import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AUTHENTICATED_ONLY_KEY } from '../../common/decorators/authenticated-only.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuditEvent, AuditService } from '../../audit';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import {
  permissionsForRole,
  type Permission,
  type Role,
} from '../../common/auth/permissions';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let required: Permission[] | undefined;
  let isPublic: boolean | undefined;
  let authenticatedOnly: boolean | undefined;
  let events: AuditEvent[];
  let guard: PermissionsGuard;

  const principal = (role: Role): AuthPrincipal => ({
    userId: randomUUID(),
    sessionId: randomUUID(),
    role,
    permissions: permissionsForRole(role),
  });

  const context = (user?: AuthPrincipal): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          method: 'POST',
          route: { path: '/invoices' },
          headers: {},
          ip: '203.0.113.1',
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    required = undefined;
    isPublic = undefined;
    authenticatedOnly = undefined;
    events = [];
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === IS_PUBLIC_KEY) return isPublic;
        if (key === AUTHENTICATED_ONLY_KEY) return authenticatedOnly;
        if (key === PERMISSIONS_KEY) return required;
        return undefined;
      },
    } as unknown as Reflector;
    const audit = {
      record: (event: AuditEvent) => {
        events.push(event);
        return Promise.resolve();
      },
    } as unknown as AuditService;
    guard = new PermissionsGuard(reflector, audit);
  });

  it('allows a public route without any decorator check', async () => {
    isPublic = true;
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(events).toEqual([]);
  });

  it('allows an authenticated-only route for every role', async () => {
    authenticatedOnly = true;
    await expect(
      guard.canActivate(context(principal('AUDITOR'))),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(context(principal('ACCOUNTANT'))),
    ).resolves.toBe(true);
    expect(events).toEqual([]);
  });

  it('fails closed on a non-public route with no permission declared', async () => {
    const accountant = principal('ACCOUNTANT');
    await expect(guard.canActivate(context(accountant))).rejects.toThrow(
      new ForbiddenException('Forbidden resource'),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'ACCESS_DENIED',
      outcome: 'FAILURE',
      actorUserId: accountant.userId,
      metadata: { requiredPermissions: [], role: 'ACCOUNTANT' },
    });
  });

  it('treats an empty @RequirePermissions() as not declared', async () => {
    required = [];
    await expect(
      guard.canActivate(context(principal('AUDITOR'))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a declared permission win over the authenticated-only marker', async () => {
    required = ['invoice:create'];
    authenticatedOnly = true;
    await expect(
      guard.canActivate(context(principal('AUDITOR'))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an accountant to create and read', async () => {
    required = ['invoice:create'];
    await expect(
      guard.canActivate(context(principal('ACCOUNTANT'))),
    ).resolves.toBe(true);
    required = ['invoice:read'];
    await expect(
      guard.canActivate(context(principal('ACCOUNTANT'))),
    ).resolves.toBe(true);
  });

  it('allows an auditor to read', async () => {
    required = ['invoice:read'];
    await expect(
      guard.canActivate(context(principal('AUDITOR'))),
    ).resolves.toBe(true);
    expect(events).toEqual([]);
  });

  it('forbids an auditor from creating and audits ACCESS_DENIED', async () => {
    required = ['invoice:create'];
    const auditor = principal('AUDITOR');
    await expect(guard.canActivate(context(auditor))).rejects.toThrow(
      new ForbiddenException('Forbidden resource'),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'ACCESS_DENIED',
      outcome: 'FAILURE',
      actorUserId: auditor.userId,
      metadata: {
        requiredPermissions: ['invoice:create'],
        role: 'AUDITOR',
        method: 'POST',
        route: '/invoices',
      },
    });
  });

  it('requires every listed permission', async () => {
    required = ['invoice:read', 'invoice:create'];
    await expect(
      guard.canActivate(context(principal('AUDITOR'))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids when no principal is attached', async () => {
    required = ['invoice:read'];
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
