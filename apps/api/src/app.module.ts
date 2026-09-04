import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { RATE_LIMIT_DEFAULT } from '@bazaar/shared';

import { AdminModule } from './admin/admin.module';
import { AdminAuditInterceptor } from './admin/admin-audit.interceptor';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { CouponsModule } from './coupons/coupons.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor';
import { RedisModule } from './common/redis/redis.module';
import { RequestContextModule } from './common/request-context.module';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MetricsInterceptor } from './observability/metrics.interceptor';
import { ObservabilityModule } from './observability/observability.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { QueueModule } from './queue/queue.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SearchModule } from './search/search.module';
import { ShippingModule } from './shipping/shipping.module';
import { UploadModule } from './upload/upload.module';
import { UsersModule } from './users/users.module';
import { WishlistModule } from './wishlist/wishlist.module';

@Module({
  imports: [
    // Must be first: it wires Sentry into the Nest lifecycle so a handler that
    // throws is attributed to its controller and route rather than to Express.
    // The SDK itself is initialised before the container exists - see
    // observability/instrument.ts, imported at the top of main.ts.
    SentryModule.forRoot(),

    ConfigModule.forRoot({
      isGlobal: true,
      // The workspace root .env is the single source of truth; apps/api/.env
      // overrides it per-developer when present.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
      cache: true,
    }),

    // D3: 100 requests per minute per IP. Auth endpoints tighten this to 20
    // with a route-level @Throttle in Phase 2.
    ThrottlerModule.forRoot([
      { ttl: RATE_LIMIT_DEFAULT.ttl, limit: RATE_LIMIT_DEFAULT.limit },
    ]),

    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // @nestjs/jwt v11 types expiresIn as ms's `StringValue` template
          // literal ("15m", "7d", ...). The env value is validated as a plain
          // string, so narrow it here at the single point of entry.
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '15m') as NonNullable<JwtModuleOptions['signOptions']>['expiresIn'],
        },
      }),
    }),

    ScheduleModule.forRoot(),

    RequestContextModule,
    ObservabilityModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    UploadModule,
    CategoriesModule,
    ProductsModule,
    SearchModule,
    ReviewsModule,
    CouponsModule,
    CartModule,
    WishlistModule,
    ShippingModule,
    PaymentsModule,
    OrdersModule,
    AdminModule,
    AnalyticsModule,
    AiModule,
    HealthModule,
  ],
  providers: [
    // Interceptors run in declaration order on the way in, so the first one
    // registered is the outermost. Metrics goes first because the latency it
    // records should cover everything below it - timing only the handler would
    // hide the cost of the audit log (Phase 12.8). The request context then has
    // to be open before the audit interceptor logs anything through it, and
    // both sit outside any feature module, so a new admin route is covered the
    // day it is written rather than the day someone remembers to decorate it
    // (Phase 8).
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },

    // Order matters: throttle first, then authenticate, then check roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Authentication is opt-out. A route without @Public() requires a token, so
    // forgetting a decorator locks a route down instead of exposing it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
