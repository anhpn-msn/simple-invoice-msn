import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestApplicationOptions } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HTTP_HEADERS } from './common/http/http-headers.constants';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { AppConfigService } from './config/app-config.service';
import type { ConfigureAppOptions } from './app.types';

/**
 * Options that must be passed to NestFactory.create (or createNestApplication in
 * tests) so configureApp can install the 16 kB JSON body parser itself and so
 * startup logs are routed through pino.
 */
export const APP_CREATE_OPTIONS: NestApplicationOptions = {
  bodyParser: false,
  bufferLogs: true,
};

const JSON_BODY_LIMIT = '16kb';
/** One reverse proxy (nginx) sits in front of the API, so `req.ip` is the real client. */
const TRUST_PROXY_HOPS = 1;
export const SWAGGER_UI_PATH = 'api/docs';
export const SWAGGER_JSON_PATH = 'api/docs-json';

/**
 * Applies all HTTP-level setup. Shared by main.ts and the e2e harness so tests
 * exercise exactly the production middleware, pipe and filter.
 */
export function configureApp(
  app: NestExpressApplication,
  options: ConfigureAppOptions = {},
): void {
  const config = app.get(AppConfigService);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.set('trust proxy', TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  const requestId = new RequestIdMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestId.use(req, res, next),
  );

  const defaultHelmet = helmet();
  // Swagger UI needs inline script/style and must not be upgraded to https on
  // plain-http deployments, so only its routes get this relaxed policy.
  const docsHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
        'upgrade-insecure-requests': null,
      },
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(`/${SWAGGER_UI_PATH}`)
      ? docsHelmet(req, res, next)
      : defaultHelmet(req, res, next),
  );

  app.use(cookieParser());
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });

  if (config.get('corsOrigins').length > 0) {
    app.enableCors({
      origin: config.get('corsOrigins'),
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: [
        HTTP_HEADERS.CONTENT_TYPE,
        HTTP_HEADERS.AUTHORIZATION,
        HTTP_HEADERS.IDEMPOTENCY_KEY,
        HTTP_HEADERS.REQUESTED_WITH,
        HTTP_HEADERS.REQUEST_ID,
      ],
      exposedHeaders: [
        HTTP_HEADERS.REQUEST_ID,
        HTTP_HEADERS.IDEMPOTENT_REPLAYED,
        HTTP_HEADERS.LOCATION,
      ],
    });
  }

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  if (config.get('swaggerEnabled')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('SimpleInvoice API')
        .setDescription('Invoice management API')
        .setVersion('1.0.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
        .build(),
    );
    SwaggerModule.setup(SWAGGER_UI_PATH, app, document, {
      jsonDocumentUrl: SWAGGER_JSON_PATH,
    });
  }

  if (options.enableShutdownHooks ?? true) {
    app.enableShutdownHooks();
  }
}
