// MUST be first. Sentry patches http, express and Prisma as they are required,
// so anything imported above it loads uninstrumented. See instrument.ts.
import './observability/instrument';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { buildHelmetOptions } from './config/security-headers';

async function bootstrap(): Promise<void> {
  // `rawBody` keeps the untouched request bytes on `request.rawBody`. Stripe's
  // webhook signature is computed over exactly those bytes, so a body that has
  // been parsed and re-serialised can never be verified.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = config.get<number>('API_PORT') ?? 4000;
  const prefix = config.get<string>('API_GLOBAL_PREFIX') ?? 'api/v1';
  const corsOrigin = config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  /**
   * D4: how many proxies sit in front of us.
   *
   * Express reads the client IP from the *last* hop it does not trust in
   * `X-Forwarded-For`. Left at the default the rate limiter sees Railway's
   * router as every client and throttles the whole world as one bucket; set too
   * high it believes a header the client wrote and the limit becomes optional.
   * The count is deployment-specific, so it is configuration, not a constant.
   */
  const proxyHops = config.get<number>('TRUST_PROXY_HOPS') ?? 0;
  if (proxyHops > 0) app.set('trust proxy', proxyHops);

  // D4: security headers, including the CSP that Phase 12 finally has the
  // origins to write. See config/security-headers.ts.
  app.use(helmet(buildHelmetOptions(config)));
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
  // Railway sends SIGTERM and waits before SIGKILL, so in-flight checkouts
  // finish rather than being cut off mid-payment.
  app.enableShutdownHooks();

  // 0.0.0.0, not localhost: inside a container, binding the loopback interface
  // means the platform's health check cannot reach the port and the deploy is
  // rolled back with a green process and a red dashboard (Phase 12.2).
  await app.listen(port, '0.0.0.0');

  logger.log(
    `Bazaar API listening on port ${port} (${isProduction ? 'production' : 'development'})`,
  );
  logger.log(`Health check: /${prefix}/health  ·  readiness: /${prefix}/health/ready`);
}

void bootstrap();
