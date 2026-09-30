import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { Request } from 'express';
import {
  HTTP_HEADERS,
  headerKey,
} from '../../common/http/http-headers.constants';
import { AppConfigService } from '../../config/app-config.service';
import { ALLOWED_FETCH_SITES, CSRF_HEADER_VALUE } from '../auth.constants';

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? undefined : value;

/**
 * CSRF checks for the cookie endpoints (SPEC 7.3). All must pass:
 * the custom header (forces a CORS preflight cross-site pages cannot pass),
 * `Origin` in the allowlist when sent, and `Sec-Fetch-Site` same-origin or
 * none when sent. A repeated header is treated as a failure.
 */
export function isCsrfSafe(
  headers: IncomingHttpHeaders,
  allowedOrigins: readonly string[],
): boolean {
  if (
    single(headers[headerKey(HTTP_HEADERS.REQUESTED_WITH)]) !==
    CSRF_HEADER_VALUE
  )
    return false;

  const origin = headers[headerKey(HTTP_HEADERS.ORIGIN)];
  if (
    origin !== undefined &&
    (Array.isArray(origin) || !allowedOrigins.includes(origin))
  ) {
    return false;
  }

  const fetchSite = headers[headerKey(HTTP_HEADERS.SEC_FETCH_SITE)];
  if (fetchSite !== undefined) {
    const value = single(fetchSite);
    if (value === undefined || !ALLOWED_FETCH_SITES.has(value)) return false;
  }
  return true;
}

/** Applied with @UseGuards on /auth/refresh and /auth/logout; 403 on failure. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!isCsrfSafe(request.headers, this.config.get('allowedOrigins'))) {
      throw new ForbiddenException('Forbidden resource');
    }
    return true;
  }
}
