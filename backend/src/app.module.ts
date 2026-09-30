import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClockModule } from './common/clock/clock.module';
import {
  AUTH_THROTTLE_KEY,
  type AuthThrottleScope,
} from './common/throttle/throttle.constants';
import { buildLoggerParams } from './common/logging/logger.config';
import { AppConfigService } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { InvoicesModule } from './invoices/invoices.module';
import { UsersModule } from './users/users.module';

const THROTTLE_TTL_MS = 60_000;

/** True when the matched handler is not tagged with `@AuthThrottle(scope)`. */
const isNotScope =
  (reflector: Reflector, scope: AuthThrottleScope) =>
  (context: ExecutionContext): boolean =>
    reflector.get<AuthThrottleScope | undefined>(
      AUTH_THROTTLE_KEY,
      context.getHandler(),
    ) !== scope;

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        buildLoggerParams(config.values),
    }),
    // Every named throttler applies to every route unless skipIf says
    // otherwise, so login and refresh are scoped to their own handlers.
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService, Reflector],
      useFactory: (config: AppConfigService, reflector: Reflector) => ({
        throttlers: [
          {
            name: 'default',
            ttl: THROTTLE_TTL_MS,
            limit: config.get('throttleGlobalLimit'),
          },
          {
            name: 'login',
            ttl: THROTTLE_TTL_MS,
            limit: config.get('throttleLoginLimit'),
            skipIf: isNotScope(reflector, 'login'),
          },
          {
            name: 'refresh',
            ttl: THROTTLE_TTL_MS,
            limit: config.get('throttleRefreshLimit'),
            skipIf: isNotScope(reflector, 'refresh'),
          },
        ],
      }),
    }),
    DatabaseModule,
    ClockModule,
    AuditModule,
    AuthModule,
    UsersModule,
    InvoicesModule,
    IdempotencyModule,
    HealthModule,
  ],
  // Registered in AppModule so it runs before any guard added by feature modules.
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
