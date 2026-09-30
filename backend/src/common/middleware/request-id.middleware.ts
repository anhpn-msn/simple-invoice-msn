import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { HTTP_HEADERS, headerKey } from '../http/http-headers.constants';
import type { RequestWithId } from '../http/http.types';

/**
 * Returns the request id, assigning it on first call: the incoming
 * X-Request-Id if (and only if) it is a valid UUID, otherwise a fresh UUID.
 * Idempotent, so the pino-http `genReqId` hook and the middleware agree.
 */
export function ensureRequestId(req: Request, res: Response): string {
  const request = req as RequestWithId;
  if (typeof request.id === 'string') return request.id;
  const incoming = req.headers[headerKey(HTTP_HEADERS.REQUEST_ID)];
  const id =
    typeof incoming === 'string' && isUUID(incoming) ? incoming : randomUUID();
  request.id = id;
  res.setHeader(HTTP_HEADERS.REQUEST_ID, id);
  return id;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    ensureRequestId(req, res);
    next();
  }
}
