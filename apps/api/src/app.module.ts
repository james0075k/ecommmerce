import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RATE_LIMIT_DEFAULT } from '@bazaar/shared';

import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { RedisModule } from './common/redis/redis.module';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { SearchModule } from './search/search.module';
import { UploadModule } from './upload/upload.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
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

    PrismaModule,
    RedisModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    UploadModule,
    CategoriesModule,
    ProductsModule,
    SearchModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle first, then authenticate, then check roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Authentication is opt-out. A route without @Public() requires a token, so
    // forgetting a decorator locks a route down instead of exposing it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
