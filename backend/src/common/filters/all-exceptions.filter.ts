import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { Response } from 'express';
import type { RequestWithId } from '../http/http.types';
import { toLoggableError } from './error-log';
import type { ErrorBody, ErrorLogger } from './filters.types';

const INTERNAL_MESSAGE = 'Internal server error';

// Typed as number: the values are compared with plain numeric statuses.
const CLIENT_ERROR_MIN: number = HttpStatus.BAD_REQUEST;
const SERVER_ERROR_MIN: number = HttpStatus.INTERNAL_SERVER_ERROR;

function reasonPhrase(status: number): string {
  return STATUS_CODES[status] ?? 'Error';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** Errors thrown by Express middleware (body-parser) carry `status` and `expose`. */
function isExposedHttpError(
  error: unknown,
): error is { status: number; message: string } {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { status?: unknown; expose?: unknown };
  return (
    candidate.expose === true &&
    typeof candidate.status === 'number' &&
    candidate.status >= CLIENT_ERROR_MIN &&
    candidate.status < SERVER_ERROR_MIN
  );
}

function fromHttpException(exception: HttpException): ErrorBody {
  const status = exception.getStatus();
  const response = exception.getResponse();
  let message: string | string[] = exception.message;
  let error = reasonPhrase(status);
  if (typeof response === 'string') {
    message = response;
  } else if (typeof response === 'object' && response !== null) {
    const body = response as { message?: unknown; error?: unknown };
    if (typeof body.message === 'string' || isStringArray(body.message)) {
      message = body.message;
    }
    if (typeof body.error === 'string') error = body.error;
  }
  return { statusCode: status, message, error };
}

/**
 * Maps every thrown value to `{ statusCode, message, error }`. HttpExceptions
 * pass through (validation errors keep `message` as string[]); anything else is
 * logged (without SQL or bound values) with the request id and answered with a
 * generic 500 so stacks, SQL and internal details never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: ErrorLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithId>();

    let body: ErrorBody;
    if (exception instanceof HttpException) {
      body = fromHttpException(exception);
    } else if (isExposedHttpError(exception)) {
      body = {
        statusCode: exception.status,
        message: exception.message,
        error: reasonPhrase(exception.status),
      };
    } else {
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: INTERNAL_MESSAGE,
        error: reasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR),
      };
    }

    if (body.statusCode >= SERVER_ERROR_MIN) {
      this.logger.error(
        {
          err: toLoggableError(exception),
          requestId: typeof request.id === 'string' ? request.id : undefined,
          method: request.method,
          path: request.originalUrl?.split('?')[0],
        },
        'Unhandled exception',
      );
    }

    if (response.headersSent) return;
    response.status(body.statusCode).json(body);
  }
}
