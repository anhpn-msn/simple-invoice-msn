import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '../auth/auth.types';

/** Injects the AuthPrincipal set on `request.user` by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthPrincipal }>();
    return request.user;
  },
);
