import type { LoggableError } from './filters.types';

const MAX_CAUSE_DEPTH = 5;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function firstLine(message: string): string {
  return message.split('\n')[0];
}

function causeChain(error: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    const record = asRecord(current);
    if (!record) break;
    chain.push(record);
    current = record.cause;
  }
  return chain;
}

/** node-postgres errors carry `severity` and a SQLSTATE `code`; Node system errors (ECONNRESET) do not. */
function isPgDriverError(record: Record<string, unknown>): boolean {
  return typeof record.severity === 'string' && typeof record.code === 'string';
}

/** drizzle-orm wraps failures in DrizzleQueryError, which stores the SQL and every bound value. */
function isDrizzleQueryError(record: Record<string, unknown>): boolean {
  return typeof record.query === 'string' || Array.isArray(record.params);
}

/** Keeps the frames only: the first stack lines repeat the message, which may hold SQL and values. */
function stackFrames(stack: unknown): string | undefined {
  if (typeof stack !== 'string') return undefined;
  const frames = stack
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '));
  return frames.length > 0 ? frames.join('\n') : undefined;
}

/**
 * Builds the object that is logged for an unhandled error. Database errors
 * are reduced to SQLSTATE, constraint, table and the first line of the driver
 * message. The drizzle message, `params`, `query`, and the driver `detail`
 * (which repeats the offending row values) are never copied, because they
 * hold customer data. Other errors keep name, message and stack.
 */
export function toLoggableError(error: unknown): LoggableError {
  const chain = causeChain(error);
  const isDatabaseError = chain.some(
    (record) => isPgDriverError(record) || isDrizzleQueryError(record),
  );

  if (!isDatabaseError) {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { name: typeof error };
  }

  const driver = chain.find(isPgDriverError);
  const message = driver ? optionalString(driver.message) : undefined;
  return {
    name: optionalString(chain[0].name) ?? 'DatabaseError',
    message: message ? firstLine(message) : 'Database query failed',
    code: driver ? optionalString(driver.code) : undefined,
    constraint: driver ? optionalString(driver.constraint) : undefined,
    table: driver ? optionalString(driver.table) : undefined,
    stack: stackFrames(chain[0].stack),
  };
}
