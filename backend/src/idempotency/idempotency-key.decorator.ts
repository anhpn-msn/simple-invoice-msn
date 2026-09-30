import {
  BadRequestException,
  type ExecutionContext,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { HTTP_HEADERS, headerKey } from '../common/http/http-headers.constants';
import { IDEMPOTENCY_KEY_MAX_LENGTH } from '../database/database.constants';

const VISIBLE_ASCII_KEY = new RegExp(
  `^[\\x21-\\x7E]{1,${IDEMPOTENCY_KEY_MAX_LENGTH}}$`,
);

/**
 * Validates the optional Idempotency-Key header (SPEC 6.7): 1 to 255 visible
 * ASCII characters. Absent means "no idempotency"; a present but malformed
 * value is a 400 so a client bug is never silently treated as "no key".
 * A repeated header arrives joined with ", ", which contains a space and is
 * therefore rejected too.
 */
export function parseIdempotencyKey(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !VISIBLE_ASCII_KEY.test(value)) {
    throw new BadRequestException(
      `${HTTP_HEADERS.IDEMPOTENCY_KEY} must be 1 to ${IDEMPOTENCY_KEY_MAX_LENGTH} visible ASCII characters`,
    );
  }
  return value;
}

/**
 * Parameter decorator for the validated header. Nest's `@Headers()` accepts no
 * pipes in this version, so the validation lives in the decorator itself.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    parseIdempotencyKey(
      context.switchToHttp().getRequest<Request>().headers[
        headerKey(HTTP_HEADERS.IDEMPOTENCY_KEY)
      ],
    ),
);
