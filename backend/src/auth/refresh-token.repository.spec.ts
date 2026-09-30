import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Client } from 'pg';
import * as schema from '../database/schema';
import { REFRESH_FAMILY_LOCK_NAMESPACE } from './auth.constants';
import { RefreshTokenRepository } from './refresh-token.repository';

interface RecordedQuery {
  text: string;
  values: unknown[];
}

/**
 * Stands in for a pg connection and records the SQL Drizzle sends, so the
 * statement order (lock, then update) is checked without a database. The
 * real race is covered by test/refresh-revoke-race.e2e-spec.ts.
 */
function recordingClient(updatedIds: string[]): {
  client: Client;
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  const client = {
    query: (config: { text: string }, values: unknown[] = []) => {
      queries.push({ text: config.text.toLowerCase(), values });
      const rows = config.text.startsWith('update')
        ? updatedIds.map((id) => [id])
        : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    },
  };
  return { client: client as unknown as Client, queries };
}

describe('RefreshTokenRepository.lockFamily', () => {
  it('binds the namespace and the family id as parameters', async () => {
    const { client, queries } = recordingClient([]);
    const repo = new RefreshTokenRepository(drizzle(client, { schema }));
    const familyId = randomUUID();

    await repo.transaction((tx) => repo.lockFamily(tx, familyId));

    expect(queries.map((q) => q.text)).toEqual([
      'begin',
      'select pg_advisory_xact_lock($1::int, hashtext($2::text))',
      'commit',
    ]);
    expect(queries[1].values).toEqual([
      REFRESH_FAMILY_LOCK_NAMESPACE,
      familyId,
    ]);
  });
});

describe('RefreshTokenRepository.revokeFamily', () => {
  const familyId = randomUUID();
  const now = new Date('2026-09-30T00:00:00.000Z');

  it('takes the family advisory lock, then updates the live rows', async () => {
    const { client, queries } = recordingClient([randomUUID(), randomUUID()]);
    const repo = new RefreshTokenRepository(drizzle(client, { schema }));

    const revoked = await repo.transaction((tx) =>
      repo.revokeFamily(tx, familyId, now),
    );

    expect(revoked).toBe(2);
    const [begin, lock, update, commit] = queries;
    expect(queries).toHaveLength(4);
    expect(begin.text).toBe('begin');
    expect(commit.text).toBe('commit');

    expect(lock.text).toBe(
      'select pg_advisory_xact_lock($1::int, hashtext($2::text))',
    );
    expect(lock.values).toEqual([REFRESH_FAMILY_LOCK_NAMESPACE, familyId]);

    expect(update.text).toMatch(/^update "refresh_tokens" set "revoked_at"/);
    expect(update.text).toContain('"family_id" = $');
    expect(update.text).toContain('"revoked_at" is null');
    expect(update.values).toContain(familyId);
  });

  it('returns 0 when nothing was left to revoke', async () => {
    const { client } = recordingClient([]);
    const repo = new RefreshTokenRepository(drizzle(client, { schema }));

    await expect(
      repo.transaction((tx) => repo.revokeFamily(tx, familyId, now)),
    ).resolves.toBe(0);
  });
});
