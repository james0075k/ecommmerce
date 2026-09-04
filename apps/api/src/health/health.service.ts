import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { SearchService } from '../search/search.service';

/** What a dependency probe can report. `degraded` is up-but-not-ideal. */
export type DependencyState = 'connected' | 'disconnected' | 'degraded';

export interface HealthReport {
  status: 'ok' | 'degraded';

  /* --- The flat contract the blueprint specifies (Phase 12.2) ----------- */
  /** `connected` only when a real `SELECT 1` came back. */
  db: DependencyState;
  /**
   * `degraded` is the interesting value: it means the in-process fallback
   * store is serving OTP codes and the token denylist. The process is healthy
   * and the data is not shared with any other instance - see RedisService.
   */
  redis: DependencyState;
  /** Seconds since this process started. */
  uptime: number;

  /* --- Context the flat contract has no room for ------------------------ */
  timestamp: string;
  environment: string;
  /** Commit SHA of the running build, when the deploy passed one through. */
  version: string | null;
  services: {
    api: 'up';
    database: 'up' | 'down';
    /** `memory` means the in-process fallback is active - see RedisService. */
    cache: 'redis' | 'memory';
    search: 'meilisearch' | 'postgres';
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly search: SearchService,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<HealthReport> {
    const databaseUp = await this.prisma.isHealthy();
    const redisUp = this.redis.isDistributed();

    return {
      // The API itself is up; a missing database degrades rather than kills it,
      // so load balancers keep serving cached reads (D3). Redis falling back to
      // the in-process store degrades too - correctness quietly drops, and a
      // green dashboard would hide that.
      status: databaseUp && redisUp ? 'ok' : 'degraded',
      db: databaseUp ? 'connected' : 'disconnected',
      redis: redisUp ? 'connected' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: this.config.get<string>('NODE_ENV') ?? 'development',
      version: this.config.get<string>('RELEASE_VERSION') ?? null,
      services: {
        api: 'up',
        database: databaseUp ? 'up' : 'down',
        cache: redisUp ? 'redis' : 'memory',
        // Not "is it configured" but "did the client connect at boot" - the
        // storefront silently falls back to Postgres full-text otherwise, and
        // the only place that shows up is here.
        search: this.search.isAvailable() ? 'meilisearch' : 'postgres',
      },
    };
  }

  /**
   * Readiness: may this instance receive traffic?
   *
   * Deliberately stricter than `/health`. A pod that cannot reach Postgres can
   * serve almost nothing useful, so during a rolling deploy it should stay out
   * of the load balancer rather than answer a thousand 500s. Redis on the
   * fallback store still counts as ready - degraded service beats no service.
   */
  async isReady(): Promise<boolean> {
    return this.prisma.isHealthy();
  }
}
