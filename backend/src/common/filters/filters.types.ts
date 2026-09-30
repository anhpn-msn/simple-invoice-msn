export interface ErrorLogger {
  error(obj: unknown, msg?: string): void;
}

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

/** What the exception filter logs for an unhandled error (no query text, no bound values). */
export interface LoggableError {
  name: string;
  message?: string;
  stack?: string;
  /** SQLSTATE of a database error. */
  code?: string;
  constraint?: string;
  table?: string;
}
