import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '../config/app-config.service';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PasswordHasher } from './password-hasher';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    // Only the secret is set here; algorithm, issuer, audience and expiry are
    // pinned on every sign and verify call in TokenService.
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.get('jwtSecret'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PasswordHasher,
    TokenService,
    RefreshTokenRepository,
    RefreshTokenService,
    AuthService,
    CsrfGuard,
    // Global guards run in registration order, after AppModule's ThrottlerGuard:
    // authentication must finish before permissions are checked.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
