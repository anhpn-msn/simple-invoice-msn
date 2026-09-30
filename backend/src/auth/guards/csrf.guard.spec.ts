import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { AppConfig } from '../../config/config.types';
import { AppConfigService } from '../../config/app-config.service';
import { CsrfGuard, isCsrfSafe } from './csrf.guard';
import {
  HTTP_HEADERS,
  headerKey,
} from '../../common/http/http-headers.constants';
import { CSRF_HEADER_VALUE } from '../auth.constants';

const ALLOWED = ['http://localhost:8080'];
const base: IncomingHttpHeaders = {
  [headerKey(HTTP_HEADERS.REQUESTED_WITH)]: CSRF_HEADER_VALUE,
};

describe('isCsrfSafe', () => {
  it('accepts the custom header alone (non-browser or old browser)', () => {
    expect(isCsrfSafe(base, ALLOWED)).toBe(true);
  });

  it('accepts an allowed origin with same-origin or none fetch site', () => {
    expect(
      isCsrfSafe(
        {
          ...base,
          [headerKey(HTTP_HEADERS.ORIGIN)]: ALLOWED[0],
          [headerKey(HTTP_HEADERS.SEC_FETCH_SITE)]: 'same-origin',
        },
        ALLOWED,
      ),
    ).toBe(true);
    expect(
      isCsrfSafe(
        { ...base, [headerKey(HTTP_HEADERS.SEC_FETCH_SITE)]: 'none' },
        ALLOWED,
      ),
    ).toBe(true);
  });

  it.each<[string, IncomingHttpHeaders]>([
    ['the header is missing', {}],
    [
      'the header value is wrong',
      { [headerKey(HTTP_HEADERS.REQUESTED_WITH)]: 'XMLHttpRequest' },
    ],
    [
      'the origin is not allowed',
      { ...base, [headerKey(HTTP_HEADERS.ORIGIN)]: 'https://evil.example' },
    ],
    [
      'the origin is the string null',
      { ...base, [headerKey(HTTP_HEADERS.ORIGIN)]: 'null' },
    ],
    [
      'the request is cross-site',
      { ...base, [headerKey(HTTP_HEADERS.SEC_FETCH_SITE)]: 'cross-site' },
    ],
    [
      'the request is same-site but not same-origin',
      { ...base, [headerKey(HTTP_HEADERS.SEC_FETCH_SITE)]: 'same-site' },
    ],
  ])('rejects when %s', (_name, headers) => {
    expect(isCsrfSafe(headers, ALLOWED)).toBe(false);
  });
});

describe('CsrfGuard', () => {
  const guard = new CsrfGuard(
    new AppConfigService({ allowedOrigins: ALLOWED } as AppConfig),
  );
  const contextFor = (headers: IncomingHttpHeaders): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as unknown as ExecutionContext;

  it('lets a safe request through', () => {
    expect(guard.canActivate(contextFor(base))).toBe(true);
  });

  it('answers 403 otherwise', () => {
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
  });
});
