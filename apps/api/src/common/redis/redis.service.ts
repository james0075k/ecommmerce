import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Key/value store with TTLs, used for OTP codes, login attempt counters and the
 * refresh-token denylist.
 *
 * Redis is the real implementation. When it is unreachable the service falls
 * back to an in-process map so local development works without running Redis -
 * it logs a warning once, and the fallback is explicitly NOT safe for
 * production: it is per-process, so it neither survives a restart nor shares
 * state across instances (a revoked token would still work on another node).
 * `isDistributed()` reports which mode is active and /health surfaces it.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private connected = false;

  /** value + absolute expiry in epoch ms. */
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn('REDIS_URL is not set - using the in-memory fallback store.');
      this.startSweeper();
      return;
    }

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      // Stop reconnect storms in dev when nothing is listening on 6379.
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });

    this.client.on('error', (error: Error) => {
      if (this.connected) {
        this.logger.error(`Redis connection lost: ${error.message}`);
        this.connected = false;
      }
    });

    this.client.on('ready', () => {
      this.connected = true;
      this.logger.log('Connected to Redis');
    });

    this.client.connect().catch((error: unknown) => {
      this.logger.warn(
        `Could not reach Redis at ${url} - using the in-memory fallback store. ` +
          `OTP codes and token revocation will not survive a restart. ` +
          `(${error instanceof Error ? error.message : String(error)})`,
      );
    });

    this.startSweeper();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.client?.disconnect();
  }

  /** True when backed by real Redis; false when using the in-process fallback. */
  isDistributed(): boolean {
    return this.connected;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.connected && this.client) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async get(key: string): Promise<string | null> {
    if (this.connected && this.client) {
      return this.client.get(key);
    }

    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<void> {
    if (this.connected && this.client) {
      await this.client.del(key);
      return;
    }
    this.memory.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  /**
   * Increments a counter and returns the new value, setting the TTL on first
   * write. Used for login attempt throttling (D4: 5 failures -> 15min lockout).
   */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (this.connected && this.client) {
      const count = await this.client.incr(key);
      if (count === 1) await this.client.expire(key, ttlSeconds);
      return count;
    }

    const current = await this.get(key);
    const next = current ? Number(current) + 1 : 1;
    const entry = this.memory.get(key);
    const expiresAt = current && entry ? entry.expiresAt : Date.now() + ttlSeconds * 1000;
    this.memory.set(key, { value: String(next), expiresAt });
    return next;
  }

  /** Seconds until the key expires, or 0 when it is absent. */
  async ttl(key: string): Promise<number> {
    if (this.connected && this.client) {
      const seconds = await this.client.ttl(key);
      return seconds > 0 ? seconds : 0;
    }

    const entry = this.memory.get(key);
    if (!entry) return 0;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  /** Drops expired fallback entries so the map cannot grow without bound. */
  private startSweeper(): void {
    this.sweeper = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memory) {
        if (entry.expiresAt <= now) this.memory.delete(key);
      }
    }, 60_000);
    this.sweeper.unref();
  }
}
