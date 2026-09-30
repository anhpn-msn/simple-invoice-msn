import { HttpStatus, ValidationPipe } from '@nestjs/common';

/**
 * Global validation pipe. Failures become 400 `{ statusCode, message: string[],
 * error }` via Nest's default exception factory (nested paths are prefixed,
 * e.g. "customer.email must be an email").
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: false,
    errorHttpStatusCode: HttpStatus.BAD_REQUEST,
  });
}
