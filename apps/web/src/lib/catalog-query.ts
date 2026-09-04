/**
 * The listing's URL contract, shared between the server and the client.
 *
 * Every filter lives in the query string (G1: shareable filtered views), which
 * means two places have to agree on exactly how it is spelled: the server
 * component that fetches the first page, and the client view that re-fetches
 * when a filter changes. When those two disagree by so much as a default value
 * they produce different React Query keys, the server's work is thrown away and
 * the grid flashes a skeleton over data it already had.
 *
 * So the parse and the serialise both live here, and neither side owns them.
 * This module is deliberately free of both `'use client'` and any server-only
 * import - it is imported from both sides.
 */

export const PAGE_SIZE = 12;

const DEFAULT_SORT = 'newest';

export interface CatalogQuery {
  page: number;
  limit: number;
  sort: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  search?: string;
}

/**
 * Reads the listing's state out of a query string.
 *
 * Takes anything with a `get`, so it works with `URLSearchParams` from the
 * browser and with the `ReadonlyURLSearchParams` `useSearchParams` returns.
 */
export function readCatalogQuery(params: { get(key: string): string | null }): CatalogQuery {
  const number = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  return {
    page: number('page') ?? 1,
    limit: number('limit') ?? PAGE_SIZE,
    sort: params.get('sort') ?? DEFAULT_SORT,
    category: params.get('category') ?? undefined,
    brand: params.get('brand') ?? undefined,
    minPrice: number('minPrice'),
    maxPrice: number('maxPrice'),
    rating: number('rating'),
    inStock: params.get('inStock') === 'true' ? true : undefined,
    search: params.get('search') ?? undefined,
  };
}

/**
 * Serialises the state back to a query string.
 *
 * Only non-default values are written, so a clean listing has a clean URL - and
 * because the order is fixed here rather than by whatever the browser sent, the
 * result doubles as a stable identity for one page of results. Both the React
 * Query seed check and the API's own cache key rely on that.
 */
export function buildCatalogQuery(query: CatalogQuery): string {
  const params = new URLSearchParams();

  if (query.page > 1) params.set('page', String(query.page));
  if (query.limit !== PAGE_SIZE) params.set('limit', String(query.limit));
  if (query.sort !== DEFAULT_SORT) params.set('sort', query.sort);
  if (query.category) params.set('category', query.category);
  if (query.brand) params.set('brand', query.brand);
  if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));
  if (query.rating !== undefined) params.set('rating', String(query.rating));
  if (query.inStock) params.set('inStock', 'true');
  if (query.search) params.set('search', query.search);

  return params.toString();
}

/** Turns Next's `searchParams` into something `readCatalogQuery` can read. */
export function toSearchParams(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    // A repeated parameter (`?brand=a&brand=b`) is not part of the contract;
    // the first one wins rather than the array being stringified into `a,b`.
    params.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
  }

  return params;
}
