import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CREATE_OPTIONS, configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { EnvValidationError, parseEnv } from './config/env';

async function bootstrap(): Promise<void> {
  try {
    parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  // bufferLogs (in APP_CREATE_OPTIONS) holds startup logs until configureApp
  // installs the nestjs-pino Logger.
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    APP_CREATE_OPTIONS,
  );
  configureApp(app);
  await app.listen(app.get(AppConfigService).get('port'), '0.0.0.0');
}

void bootstrap();
