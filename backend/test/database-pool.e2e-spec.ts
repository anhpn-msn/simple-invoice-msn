import { DB_STATEMENT_TIMEOUT_MS } from '../src/database/database.constants';
import { createTestApp } from './utils/test-app';
import type { TestApp } from './utils/test.types';

describe('Database pool (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  it('applies the statement timeout to every pooled connection', async () => {
    const result = await t.pool.query<{ statement_timeout: string }>(
      'SHOW statement_timeout',
    );
    expect(result.rows[0].statement_timeout).toBe(
      `${DB_STATEMENT_TIMEOUT_MS / 1000}s`,
    );
  });
});
