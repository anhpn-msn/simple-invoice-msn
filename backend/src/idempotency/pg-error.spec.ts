import { pgErrorCode, pgErrorInfo } from './pg-error';

describe('pgErrorInfo', () => {
  it('reads the SQLSTATE from the error itself', () => {
    expect(pgErrorInfo({ code: '23505', constraint: 'idx' })).toEqual({
      code: '23505',
      constraint: 'idx',
    });
  });

  it('reads the SQLSTATE from the Drizzle wrapper cause', () => {
    const wrapped = new Error('Failed query', {
      cause: Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'idx',
      }),
    });
    expect(pgErrorInfo(wrapped)).toEqual({ code: '23505', constraint: 'idx' });
    expect(pgErrorCode(wrapped)).toBe('23505');
  });

  it('returns nothing for non-database errors and odd values', () => {
    expect(pgErrorInfo(new Error('boom'))).toEqual({});
    expect(pgErrorInfo(undefined)).toEqual({});
    expect(pgErrorInfo('text')).toEqual({});
    expect(pgErrorInfo(null)).toEqual({});
  });

  it('ignores a numeric code property', () => {
    expect(pgErrorInfo({ code: 23505 })).toEqual({});
  });

  it('does not loop on a circular cause chain', () => {
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(pgErrorInfo(a)).toEqual({});
  });
});
