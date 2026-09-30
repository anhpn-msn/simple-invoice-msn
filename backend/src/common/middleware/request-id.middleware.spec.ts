import type { Request, Response } from 'express';
import { isUUID } from 'class-validator';
import { RequestIdMiddleware, ensureRequestId } from './request-id.middleware';
import { HTTP_HEADERS, headerKey } from '../http/http-headers.constants';

function run(headerValue?: string | string[]) {
  const req = {
    headers:
      headerValue === undefined
        ? {}
        : { [headerKey(HTTP_HEADERS.REQUEST_ID)]: headerValue },
  };
  const setHeader = jest.fn();
  const res = { setHeader };
  const next = jest.fn();
  new RequestIdMiddleware().use(
    req as unknown as Request,
    res as unknown as Response,
    next,
  );
  return { req: req as unknown as { id?: string }, setHeader, next };
}

describe('RequestIdMiddleware', () => {
  it('generates a UUID when the header is absent', () => {
    const { req, setHeader, next } = run();
    expect(isUUID(req.id as string)).toBe(true);
    expect(setHeader).toHaveBeenCalledWith(HTTP_HEADERS.REQUEST_ID, req.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('echoes a valid incoming UUID', () => {
    const incoming = '123e4567-e89b-42d3-a456-426614174000';
    const { req, setHeader } = run(incoming);
    expect(req.id).toBe(incoming);
    expect(setHeader).toHaveBeenCalledWith(HTTP_HEADERS.REQUEST_ID, incoming);
  });

  it.each(['not-a-uuid', '../../etc/passwd', 'x'.repeat(200), ''])(
    'replaces the invalid incoming id %j',
    (bad) => {
      const { req } = run(bad);
      expect(req.id).not.toBe(bad);
      expect(isUUID(req.id as string)).toBe(true);
    },
  );

  it('ignores a repeated header (array value)', () => {
    const { req } = run(['123e4567-e89b-42d3-a456-426614174000', 'other']);
    expect(isUUID(req.id as string)).toBe(true);
  });

  it('is idempotent so pino genReqId and the middleware agree', () => {
    const req = { headers: {} } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const first = ensureRequestId(req, res);
    expect(ensureRequestId(req, res)).toBe(first);
    expect(setHeader).toHaveBeenCalledTimes(1);
  });
});
