import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  // `rawBody` keeps the untouched request bytes on `request.rawBody`. Stripe's
  // webhook signature is computed over exactly those bytes, so a body that has
  // been parsed and re-serialised can never be verified.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = config.get<number>('API_PORT') ?? 4000;
  const prefix = config.get<string>('API_GLOBAL_PREFIX') ?? 'api/v1';
  const corsOrigin = config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';

  // D4: security headers. CSP is configured in Phase 12 alongside the CDN,
  // since it needs the real asset origins.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  // D1: the refresh token lives in an HttpOnly cookie, so it has to be parsed.
  app.use(cookieParser());

  // D1: credentials are required so the HttpOnly refresh-token cookie is sent.
  app.enableCors({
    origin: corsOrigin.split(',').map((value) => value.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // D4: /api/v1 namespace so old versions can be deprecated gracefully.
  app.setGlobalPrefix(prefix);

  // D2: reject malformed data before it reaches business logic. `whitelist`
  // strips unknown keys so a client cannot smuggle extra fields into a DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // Lets Prisma close its pool cleanly on SIGTERM during rolling deploys (D3).
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`Bazaar API listening on http://localhost:${port}/${prefix}`);
  logger.log(`Health check:            http://localhost:${port}/${prefix}/health`);
}

void bootstrap();
