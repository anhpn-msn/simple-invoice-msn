import type { Request } from 'express';
import type { RequestWithId } from '../common/http/http.types';
import type { AuditRequestContext } from './audit.types';
import { HTTP_HEADERS, headerKey } from '../common/http/http-headers.constants';
import { USER_AGENT_MAX_LENGTH } from '../database/database.constants';

/**
 * Extracts the request facts worth keeping in the audit trail. `req.ip` is
 * already the real client address because `trust proxy` is set to one hop.
 */
export function requestContext(req: Request): AuditRequestContext {
  const id = (req as RequestWithId).id;
  const userAgent = req.headers[headerKey(HTTP_HEADERS.USER_AGENT)];
  return {
    requestId: typeof id === 'string' ? id : undefined,
    ip: req.ip,
    userAgent:
      typeof userAgent === 'string'
        ? userAgent.slice(0, USER_AGENT_MAX_LENGTH)
        : undefined,
  };
}
