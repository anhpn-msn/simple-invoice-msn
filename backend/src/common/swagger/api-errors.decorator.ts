import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

/** Wording shared by every controller; a controller overrides only what differs. */
const DEFAULT_ERROR_DESCRIPTIONS: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Validation failed',
  [HttpStatus.NOT_FOUND]: 'Not found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Rate limit exceeded',
};

/**
 * Builds an `@ApiErrors(...statuses)` decorator that documents each status
 * with the standard error body. `overrides` sets the description of the
 * statuses whose meaning is specific to the controller (401, 403, 422).
 */
export function createApiErrors(
  overrides: Partial<Record<HttpStatus, string>>,
) {
  const descriptions = { ...DEFAULT_ERROR_DESCRIPTIONS, ...overrides };
  return (...statuses: HttpStatus[]) =>
    applyDecorators(
      ...statuses.map((status) =>
        ApiResponse({
          status,
          description: descriptions[status],
          type: ErrorResponseDto,
        }),
      ),
    );
}
