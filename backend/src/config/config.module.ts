import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { parseEnv } from './env';

/**
 * Global module exposing AppConfigService. @nestjs/config only loads the
 * optional `.env` file into process.env (never in tests, which inject env
 * explicitly); all validation and typing is done by parseEnv.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: '.env',
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
  ],
  providers: [
    {
      provide: AppConfigService,
      useFactory: () => new AppConfigService(parseEnv(process.env)),
    },
  ],
  exports: [AppConfigService],
})
export class AppConfigModule {}
