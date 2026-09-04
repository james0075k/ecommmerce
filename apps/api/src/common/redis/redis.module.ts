import { Global, Module } from '@nestjs/common';

import { CacheService } from './cache.service';
import { RedisService } from './redis.service';

/** Global: OTP, throttling, token revocation and the catalog cache are needed across modules. */
@Global()
@Module({
  providers: [RedisService, CacheService],
  exports: [RedisService, CacheService],
})
export class RedisModule {}
