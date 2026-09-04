import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from './redis.service';

/**
 * Namespaces a cached value belongs to.
 *
 * Invalidation is by namespace rather than by key: an admin editing one product
 * changes its price on every listing page that contains it, in every sort
 * order, under every filter combination - which is a set nobody can enumerate.
 * Dropping the whole namespace is the only correct answer, and a catalog write
 * is rare enough that the cost of rebuilding it is irrelevant.
 */
export type CacheNamespace = 'products' | 'categories';

/** Phase 11 budgets: listings go stale fast, the category tree barely moves. */
export const CACHE_TTL = {
  /** Product listings and facets. */
  products: 300,
  /** The category tree. */
  categories: 3600,
} as const satisfies Record<CacheNamespace, number>;

/**
 * Read-through JSON cache in front of the catalog reads (Phase 11).
 *
 * The storefront's listing endpoint runs four queries per request - the page,
 * the count, the rating aggregate and the facets - and the answer is identical
 * for every visitor who asks the same question. Caching it turns the most
 * requested route in the app into one Redis round trip.
 *
 * The store underneath is `RedisService`, which falls back to an in-process map
 * when Redis is unreachable. That fallback is per-process, so in a multi-node
 * deployment two instances can hold different generations of the same listing
 * for up to the TTL. Being briefly inconsistent about which products are on
 * page 2 is acceptable; nothing that must be correct - stock at checkout,
 * prices at capture - reads through here.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Returns the cached value for `key`, or computes it, stores it and returns
   * it.
   *
   * A cache failure is never allowed to fail the request: both the read and the
   * write swallow their errors and fall through to the loader, which is the
   * behaviour the whole app already has when Redis is down.
   */
  async getOrSet<T>(
    namespace: CacheNamespace,
    key: string,
    load: () => Promise<T>,
  ): Promise<T> {
    const generation = await this.generation(namespace);
    const fullKey = `cache:${namespace}:${generation}:${key}`;

    try {
      const hit = await this.redis.get(fullKey);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (error) {
      this.logger.warn(`Cache read failed for ${fullKey}: ${message(error)}`);
    }

    const value = await load();

    try {
      await this.redis.set(fullKey, JSON.stringify(value), CACHE_TTL[namespace]);
    } catch (error) {
      this.logger.warn(`Cache write failed for ${fullKey}: ${message(error)}`);
    }

    return value;
  }

  /**
   * Invalidates every key in a namespace.
   *
   * Implemented by bumping a generation counter that is part of every key
   * rather than by deleting anything. `SCAN`-and-delete over a namespace is
   * O(keyspace) and blocks proportionally, and `KEYS` is worse; incrementing
   * one integer orphans the old entries instead and lets their own TTLs collect
   * them. The cost is holding one TTL's worth of dead entries in memory, which
   * for a five-minute listing cache is nothing.
   */
  async invalidate(namespace: CacheNamespace): Promise<void> {
    try {
      // The generation must outlive every entry stamped with it, or a rollover
      // could resurrect stale data. A day is far past the longest TTL here.
      await this.redis.increment(`cache-gen:${namespace}`, 86_400);
    } catch (error) {
      this.logger.warn(`Cache invalidation failed for ${namespace}: ${message(error)}`);
    }
  }

  /** The current generation for a namespace; 0 when it has never been bumped. */
  private async generation(namespace: CacheNamespace): Promise<string> {
    try {
      return (await this.redis.get(`cache-gen:${namespace}`)) ?? '0';
    } catch {
      return '0';
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
