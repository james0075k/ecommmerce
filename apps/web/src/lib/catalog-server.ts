import type { CategoryNode, ProductListResponse } from '@/lib/catalog';

/**
 * Server-side reads of the public catalog (Phase 11).
 *
 * The storefront's interactive surfaces talk to the API from the browser
 * through `apiFetch`, which carries the access token and the refresh cookie.
 * None of that applies here: these endpoints are public, the response is the
 * same for every visitor, and the point of fetching on the server is that the
 * first paint contains products rather than a skeleton waiting on a round trip
 * that has not started yet.
 *
 * `next: { revalidate }` puts the result in Next's own data cache, so a burst of
 * visitors to the same listing costs the API one query rather than one each.
 * The API caches the same reads in Redis behind that (`CacheService`), which is
 * what keeps a cold Next cache from turning into a Postgres scan.
 *
 * Nothing here may be imported from a client component: the module reads
 * `process.env` at request time and relies on Next's fetch cache, neither of
 * which exists in the browser. The `-server` suffix is the whole convention -
 * `server-only` is not a dependency of this workspace.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Matches the API's own listing TTL - a shorter one here would just miss. */
const LISTING_REVALIDATE_SECONDS = 300;

/** The tree changes when an admin edits it, which is rare and never urgent. */
const CATEGORY_REVALIDATE_SECONDS = 3600;

/**
 * Reads a public catalog endpoint, returning `null` rather than throwing.
 *
 * Every caller renders a degraded page instead of a 500 when the API is down:
 * a category page with an empty grid and a working navbar is a better outage
 * than an error boundary, and the client-side query re-fetches on mount anyway.
 */
async function getJson<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      next: { revalidate },
      headers: { accept: 'application/json' },
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** A cached listing page, with the moment it was actually read from the API. */
export interface CachedProductPage {
  data: ProductListResponse;
  /**
   * Epoch ms of the upstream response, taken from its `Date` header where the
   * API sends one and from the clock otherwise.
   *
   * This is the point of returning it at all: `next: { revalidate }` can hand
   * back a response that is nearly five minutes old, and the client needs to
   * know that in order to age React Query's seed correctly rather than treating
   * a stale page as freshly fetched. Reading the clock here is also what keeps
   * the caller pure - a server component must not call `Date.now()` while it
   * renders.
   */
  fetchedAt: number;
}

/** One page of the catalog, with its facets. `query` is a ready query string. */
export async function getProductPage(query: string): Promise<CachedProductPage | null> {
  const path = `/products${query ? `?${query}` : ''}`;

  try {
    const response = await fetch(`${API_URL}${path}`, {
      next: { revalidate: LISTING_REVALIDATE_SECONDS },
      headers: { accept: 'application/json' },
    });

    if (!response.ok) return null;

    const served = response.headers.get('date');
    const parsed = served ? Date.parse(served) : Number.NaN;

    return {
      data: (await response.json()) as ProductListResponse,
      fetchedAt: Number.isNaN(parsed) ? Date.now() : parsed,
    };
  } catch {
    return null;
  }
}

/** The whole category tree, roots first, each with its descendants. */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  return (await getJson<CategoryNode[]>('/categories', CATEGORY_REVALIDATE_SECONDS)) ?? [];
}

/** Finds one category anywhere in the tree by slug. */
export function findCategory(nodes: CategoryNode[], slug: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const found = findCategory(node.children, slug);
    if (found) return found;
  }
  return null;
}

/** A category's ancestors, outermost first, for breadcrumbs. */
export function findCategoryPath(
  nodes: CategoryNode[],
  slug: string,
  trail: CategoryNode[] = [],
): CategoryNode[] {
  for (const node of nodes) {
    const path = [...trail, node];
    if (node.slug === slug) return path;
    const found = findCategoryPath(node.children, slug, path);
    if (found.length > 0) return found;
  }
  return [];
}
