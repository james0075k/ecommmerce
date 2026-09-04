import { Global, Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Phase 12.8. Sentry is initialised outside the container (see instrument.ts);
 * what lives here is the Prometheus side, which needs injection to reach the
 * database and Redis.
 *
 * Global because MetricsInterceptor is registered application-wide in
 * AppModule and has to resolve MetricsService from the root injector.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
