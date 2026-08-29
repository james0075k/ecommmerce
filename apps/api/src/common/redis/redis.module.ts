import { Global, Module } from '@nestjs/common';

import { RedisService } from './redis.service';

/** Global: OTP, throttling and token revocation are needed across modules. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
