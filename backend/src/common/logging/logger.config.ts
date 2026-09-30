import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/config.types';
import { HTTP_HEADERS, headerKey } from '../http/http-headers.constants';
import { ensureRequestId } from '../middleware/request-id.middleware';
import type { Request, Response } from 'express';
import { HEALTH_ROUTE } from '../../health/health.constants';

const SECRET_FIELDS = ['password', 'accessToken', 'refreshToken'];

/**
 * pino redaction has no deep wildcard, so secret field names are covered at the
 * root and up to three levels of nesting.
 */
export const LOG_REDACT_PATHS: string[] = [
  `req.headers.${headerKey(HTTP_HEADERS.AUTHORIZATION)}`,
  `req.headers.${headerKey(HTTP_HEADERS.COOKIE)}`,
  `res.headers["${headerKey(HTTP_HEADERS.SET_COOKIE)}"]`,
  ...SECRET_FIELDS.flatMap((field) => [
    field,
    `*.${field}`,
    `*.*.${field}`,
    `*.*.*.${field}`,
  ]),
];

export const LOG_REDACT_CENSOR = '[Redacted]';

/** nestjs-pino options: JSON logs, redaction, request id binding. */
export function buildLoggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      genReqId: (req: IncomingMessage, res: ServerResponse) =>
        ensureRequestId(req as Request, res as Response),
      redact: { paths: LOG_REDACT_PATHS, censor: LOG_REDACT_CENSOR },
      autoLogging: { ignore: (req) => req.url === `/${HEALTH_ROUTE}` },
      ...(config.nodeEnv === 'development'
        ? {
            transport: { target: 'pino-pretty', options: { singleLine: true } },
          }
        : {}),
    },
  };
}
