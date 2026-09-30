import { UnprocessableEntityException } from '@nestjs/common';
import { FixedClock } from '../common/clock';
import type { AppConfigService } from '../config/app-config.service';
import type { Transaction } from '../database/database.types';
import {
  IDEMPOTENCY_PAYLOAD_MISMATCH,
  IdempotencyService,
} from './idempotency.service';
import { MS_PER_SECOND } from '../common/clock/clock.constants';

const NOW = '2026-09-30T10:00:00.000Z';
const TTL_SECONDS = 86_400;

function makeService() {
  const clock = new FixedClock(NOW);
  const config = {
    get: jest.fn().mockReturnValue(TTL_SECONDS),
  } as unknown as AppConfigService;
  return new IdempotencyService(clock, config);
}

/** Minimal chainable stand-in for the two Drizzle query shapes used by begin(). */
function makeTx(options: { claimed: boolean; existing?: unknown }) {
  const inserted: {
    values?: Record<string, unknown>;
    conflict?: Record<string, unknown>;
  } = {};
  const insertChain: Record<string, jest.Mock> = {};
  insertChain.values = jest.fn((values: Record<string, unknown>) => {
    inserted.values = values;
    return insertChain;
  });
  insertChain.onConflictDoUpdate = jest.fn(
    (conflict: Record<string, unknown>) => {
      inserted.conflict = conflict;
      return insertChain;
    },
  );
  insertChain.returning = jest
    .fn()
    .mockResolvedValue(options.claimed ? [{ userId: 'u1' }] : []);
  const selectChain = {
    from: jest.fn().mockReturnThis(),
    where: jest
      .fn()
      .mockResolvedValue(
        options.existing === undefined ? [] : [options.existing],
      ),
  };
  const updateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  };
  const tx = {
    insert: jest.fn().mockReturnValue(insertChain),
    select: jest.fn().mockReturnValue(selectChain),
    update: jest.fn().mockReturnValue(updateChain),
  };
  return { tx: tx as unknown as Transaction, mocks: tx, inserted, updateChain };
}

const request = {
  userId: 'u1',
  key: 'k1',
  method: 'POST',
  path: '/invoices',
  requestHash: 'hash-a',
};

describe('IdempotencyService.fingerprint', () => {
  const service = makeService();

  it('is stable across key order and undefined members', () => {
    expect(
      service.fingerprint('POST', '/invoices', {
        a: 1,
        b: { c: 2, d: undefined },
      }),
    ).toBe(service.fingerprint('POST', '/invoices', { b: { c: 2 }, a: 1 }));
  });

  it('changes with method, path and body', () => {
    const base = service.fingerprint('POST', '/invoices', { a: 1 });
    expect(service.fingerprint('PUT', '/invoices', { a: 1 })).not.toBe(base);
    expect(service.fingerprint('POST', '/invoices/x', { a: 1 })).not.toBe(base);
    expect(service.fingerprint('POST', '/invoices', { a: 2 })).not.toBe(base);
  });

  it('is a sha256 hex digest', () => {
    expect(service.fingerprint('POST', '/invoices', {})).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});

describe('IdempotencyService.begin', () => {
  it('claims a free key with a TTL computed from the injected clock', async () => {
    const service = makeService();
    const { tx, inserted } = makeTx({ claimed: true });

    await expect(service.begin(tx, request)).resolves.toEqual({ kind: 'new' });

    expect(inserted.values).toMatchObject({
      userId: 'u1',
      idempotencyKey: 'k1',
      requestMethod: 'POST',
      requestPath: '/invoices',
      requestHash: 'hash-a',
      createdAt: new Date(NOW),
      expiresAt: new Date(
        new Date(NOW).getTime() + TTL_SECONDS * MS_PER_SECOND,
      ),
    });
    expect(inserted.conflict).toBeDefined();
  });

  it('replays the stored response when the payload matches', async () => {
    const service = makeService();
    const stored = {
      requestHash: 'hash-a',
      responseStatus: 201,
      responseBody: { invoiceId: 'i1' },
    };
    const { tx } = makeTx({ claimed: false, existing: stored });

    await expect(service.begin(tx, request)).resolves.toEqual({
      kind: 'replay',
      response: { status: 201, body: { invoiceId: 'i1' } },
    });
  });

  it('rejects a different payload with 422', async () => {
    const service = makeService();
    const stored = {
      requestHash: 'hash-b',
      responseStatus: 201,
      responseBody: {},
    };
    const { tx } = makeTx({ claimed: false, existing: stored });

    const failure = service.begin(tx, request);
    await expect(failure).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(failure).rejects.toMatchObject({
      message: IDEMPOTENCY_PAYLOAD_MISMATCH,
    });
  });

  it('fails loudly if the conflicting row disappeared', async () => {
    const service = makeService();
    const { tx } = makeTx({ claimed: false });
    await expect(service.begin(tx, request)).rejects.toThrow(/vanished/);
  });
});

describe('IdempotencyService.complete', () => {
  it('stores status and body on the key row', async () => {
    const service = makeService();
    const { tx, updateChain } = makeTx({ claimed: true });

    await service.complete(
      tx,
      { userId: 'u1', key: 'k1' },
      { status: 201, body: { a: 1 } },
    );

    expect(updateChain.set).toHaveBeenCalledWith({
      responseStatus: 201,
      responseBody: { a: 1 },
    });
    expect(updateChain.where).toHaveBeenCalledTimes(1);
  });
});
