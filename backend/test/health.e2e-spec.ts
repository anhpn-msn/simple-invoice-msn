import { isUUID } from 'class-validator';
import { DRIZZLE } from '../src/database/database.module';
import { createTestApp, startTestDatabase } from './utils/test-app';
import type { TestApp, TestDatabase } from './utils/test.types';
import {
  HTTP_HEADERS,
  headerKey,
} from '../src/common/http/http-headers.constants';
import type { OpenAPIObject } from '@nestjs/swagger';
import { bodyOf } from './utils/http';

describe('Health and app setup (e2e)', () => {
  let database: TestDatabase;
  let ctx: TestApp;

  beforeAll(async () => {
    database = await startTestDatabase();
    ctx = await createTestApp({ database });
  });

  afterAll(async () => {
    await ctx.close();
    await database.stop();
  });

  it('GET /health returns 200 with db up when the database is reachable', async () => {
    const res = await ctx.http().get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('applies the migrations (audit_events is append-only)', async () => {
    await ctx.pool.query(
      `INSERT INTO audit_events (action, outcome) VALUES ('TEST', 'SUCCESS')`,
    );
    await expect(ctx.pool.query('DELETE FROM audit_events')).rejects.toThrow(
      'audit_events is append-only',
    );
  });

  it('echoes a valid X-Request-Id and replaces an invalid one', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    const echoed = await ctx
      .http()
      .get('/health')
      .set(HTTP_HEADERS.REQUEST_ID, id);
    expect(echoed.headers[headerKey(HTTP_HEADERS.REQUEST_ID)]).toBe(id);

    const replaced = await ctx
      .http()
      .get('/health')
      .set(HTTP_HEADERS.REQUEST_ID, 'nope');
    expect(isUUID(replaced.headers[headerKey(HTTP_HEADERS.REQUEST_ID)])).toBe(
      true,
    );
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await ctx.http().get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
  });

  it('answers unknown routes with the standard error shape', async () => {
    const res = await ctx.http().get('/nope').expect(404);
    expect(res.body).toEqual({
      statusCode: 404,
      message: 'Cannot GET /nope',
      error: 'Not Found',
    });
    expect(res.headers[headerKey(HTTP_HEADERS.REQUEST_ID)]).toBeDefined();
  });

  it('rejects JSON bodies over 16 kB with the standard error shape', async () => {
    const res = await ctx
      .http()
      .post('/health')
      .send({ blob: 'x'.repeat(20_000) })
      .expect(413);
    expect(res.body).toEqual({
      statusCode: 413,
      message: expect.any(String) as string,
      error: 'Payload Too Large',
    });
  });

  it('serves Swagger with a relaxed CSP only on the docs routes', async () => {
    const json = await ctx.http().get('/api/docs-json').expect(200);
    const doc = bodyOf<OpenAPIObject>(json);
    expect(doc.paths['/health']).toBeDefined();
    expect(doc.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });

    const ui = await ctx.http().get('/api/docs').expect(200);
    expect(ui.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests',
    );

    const health = await ctx.http().get('/health');
    expect(health.headers['content-security-policy']).toContain(
      'upgrade-insecure-requests',
    );
  });

  it('GET /health returns 503 in the error shape when the database is down', async () => {
    const failing = await createTestApp({
      database,
      overrideProviders: [
        {
          token: DRIZZLE,
          useValue: {
            execute: () => Promise.reject(new Error('connection refused')),
          },
        },
      ],
    });
    try {
      const res = await failing.http().get('/health').expect(503);
      expect(res.body).toEqual({
        statusCode: 503,
        message: 'Database unavailable',
        error: 'Service Unavailable',
      });
      expect(JSON.stringify(res.body)).not.toContain('refused');
    } finally {
      await failing.close();
    }
  });

  it('truncateBusinessTables runs and keeps audit_events', async () => {
    await ctx.truncateBusinessTables();
    const { rows } = await ctx.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM audit_events',
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
