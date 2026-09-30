import pino from 'pino';
import { Writable } from 'node:stream';
import {
  LOG_REDACT_CENSOR,
  LOG_REDACT_PATHS,
  buildLoggerParams,
} from './logger.config';
import type { AppConfig } from '../../config/config.types';

function capture(): {
  logger: pino.Logger;
  lines: () => Record<string, unknown>[];
} {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  const logger = pino(
    { redact: { paths: LOG_REDACT_PATHS, censor: LOG_REDACT_CENSOR } },
    stream,
  );
  return {
    logger,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe('log redaction', () => {
  it('redacts credentials in headers', () => {
    const { logger, lines } = capture();
    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer abc',
            cookie: 'si_rt=secret',
            accept: 'x',
          },
        },
        res: { headers: { 'set-cookie': ['si_rt=secret2'] } },
      },
      'request',
    );
    const text = JSON.stringify(lines()[0]);
    expect(text).not.toContain('Bearer abc');
    expect(text).not.toContain('si_rt=secret');
    expect(text).toContain(LOG_REDACT_CENSOR);
    expect(text).toContain('"accept":"x"');
  });

  it('redacts password and token fields at several depths', () => {
    const { logger, lines } = capture();
    logger.info({
      password: 'p1',
      body: { password: 'p2', accessToken: 'a1' },
      data: { user: { refreshToken: 'r1', nested: { password: 'p3' } } },
    });
    const text = JSON.stringify(lines()[0]);
    for (const secret of ['p1', 'p2', 'a1', 'r1', 'p3']) {
      expect(text).not.toContain(`"${secret}"`);
    }
  });
});

describe('buildLoggerParams', () => {
  const base = { logLevel: 'info', nodeEnv: 'production' } as AppConfig;

  it('uses plain JSON logging outside development', () => {
    const { pinoHttp } = buildLoggerParams(base);
    expect(pinoHttp).not.toHaveProperty('transport');
  });

  it('enables pino-pretty only in development', () => {
    const { pinoHttp } = buildLoggerParams({ ...base, nodeEnv: 'development' });
    expect(pinoHttp).toHaveProperty('transport.target', 'pino-pretty');
  });
});
