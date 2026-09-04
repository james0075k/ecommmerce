import { CacheService } from './cache.service';
import type { RedisService } from './redis.service';

/**
 * A stand-in for RedisService backed by a plain map, so the tests exercise the
 * generation logic rather than ioredis.
 */
function createStore() {
  const values = new Map<string, string>();

  const redis = {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    increment: jest.fn(async (key: string) => {
      const next = Number(values.get(key) ?? '0') + 1;
      values.set(key, String(next));
      return next;
    }),
  } as unknown as RedisService;

  return { redis, values };
}

describe('CacheService', () => {
  it('calls the loader once and serves the second read from the cache', async () => {
    const { redis } = createStore();
    const cache = new CacheService(redis);
    const load = jest.fn(async () => ({ items: [1, 2, 3] }));

    const first = await cache.getOrSet('products', 'list:a', load);
    const second = await cache.getOrSet('products', 'list:a', load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('re-runs the loader after the namespace is invalidated', async () => {
    const { redis } = createStore();
    const cache = new CacheService(redis);

    let version = 1;
    const load = jest.fn(async () => ({ version }));

    await cache.getOrSet('products', 'list:a', load);

    version = 2;
    await cache.invalidate('products');
    const after = await cache.getOrSet('products', 'list:a', load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(after).toEqual({ version: 2 });
  });

  it('keeps namespaces independent', async () => {
    const { redis } = createStore();
    const cache = new CacheService(redis);

    const products = jest.fn(async () => 'products');
    const categories = jest.fn(async () => 'categories');

    await cache.getOrSet('products', 'k', products);
    await cache.getOrSet('categories', 'k', categories);

    // Busting the catalog must not cost the category tree its entry.
    await cache.invalidate('products');

    await cache.getOrSet('products', 'k', products);
    await cache.getOrSet('categories', 'k', categories);

    expect(products).toHaveBeenCalledTimes(2);
    expect(categories).toHaveBeenCalledTimes(1);
  });

  it('falls through to the loader when the store throws', async () => {
    const redis = {
      get: jest.fn(async () => {
        throw new Error('Redis is down');
      }),
      set: jest.fn(async () => {
        throw new Error('Redis is down');
      }),
      increment: jest.fn(async () => 1),
    } as unknown as RedisService;

    const cache = new CacheService(redis);
    const load = jest.fn(async () => 'value');

    // A cache outage must degrade to an uncached read, never to a failed request.
    await expect(cache.getOrSet('products', 'k', load)).resolves.toBe('value');
    expect(load).toHaveBeenCalledTimes(1);
  });
});
