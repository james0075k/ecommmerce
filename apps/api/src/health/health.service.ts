import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  environment: string;
  services: {
    api: 'up';
    database: 'up' | 'down';
    /** `memory` means the in-process fallback is active - see RedisService. */
    cache: 'redis' | 'memory';
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<HealthReport> {
    const databaseUp = await this.prisma.isHealthy();

    return {
      // The API itself is up; a missing database degrades rather than kills it,
      // so load balancers keep serving cached reads (D3).
      status: databaseUp ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: this.config.get<string>('NODE_ENV') ?? 'development',
      services: {
        api: 'up',
        database: databaseUp ? 'up' : 'down',
        cache: this.redis.isDistributed() ? 'redis' : 'memory',
      },
    };
  }
}
