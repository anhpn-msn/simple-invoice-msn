import { SetMetadata } from '@nestjs/common';
import {
  AUTH_THROTTLE_KEY,
  type AuthThrottleScope,
} from './throttle.constants';

/**
 * Marks a handler as the target of the named `login` or `refresh` throttler.
 * The throttler is chosen by handler, not by URL text, because Express matches
 * routes case-insensitively and ignores a trailing slash, so a path comparison
 * can be bypassed with `/AUTH/LOGIN` or `/auth/login/`.
 */
export const AuthThrottle = (scope: AuthThrottleScope): MethodDecorator =>
  SetMetadata(AUTH_THROTTLE_KEY, scope);
