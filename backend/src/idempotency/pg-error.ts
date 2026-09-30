import type { PgErrorInfo } from './idempotency.types';
const MAX_CAUSE_DEPTH = 5;

/**
 * Drizzle wraps driver errors, so the SQLSTATE lives on `error.cause`, not on
 * the error itself. Walks the cause chain and returns the first SQLSTATE found.
 */
export function pgErrorInfo(error: unknown): PgErrorInfo {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return {};
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof candidate.code === 'string') {
      return {
        code: candidate.code,
        constraint:
          typeof candidate.constraint === 'string'
            ? candidate.constraint
            : undefined,
      };
    }
    current = candidate.cause;
  }
  return {};
}

export function pgErrorCode(error: unknown): string | undefined {
  return pgErrorInfo(error).code;
}
