import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeilisearchClient } from './meilisearch.client';
import type { Prisma } from '@prisma/client';
import type { CatalogFacets, SearchQueryInput } from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';

export const PRODUCT_INDEX = 'products';

/** The denormalised document shape pushed to Meilisearch. */
export interface ProductDocument {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription: string;
  brand: string;
  tags: string[];
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  isFeatured: boolean;
  imageUrl: string | null;
  blurhash: string | null;
  createdAt: number;
}

export interface SearchOutcome {
  ids: string[];
  total: number;
  facets: CatalogFacets;
  /** Which backend answered - the frontend shows a notice when it degraded. */
  engine: 'meilisearch' | 'postgres';
}

/**
 * Product search.
 *
 * Meilisearch is primary. D3 requires a PostgreSQL fallback so search degrades
 * rather than fails when the index is unavailable, and that fallback is a real
 * code path here, not a stub - it is what runs whenever MEILI_HOST is unset or
 * unreachable.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private client: MeilisearchClient | null = null;
  private available = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const host = this.config.get<string>('MEILI_HOST');

    if (!host) {
      this.logger.warn('MEILI_HOST is not set - search falls back to PostgreSQL.');
      return;
    }

    this.client = new MeilisearchClient(host, this.config.get<string>('MEILI_MASTER_KEY'));

    try {
      await this.client.health();
      await this.ensureIndex();
      this.available = true;
      this.logger.log('Connected to Meilisearch');
    } catch (error) {
      this.available = false;
      this.logger.warn(
        `Could not reach Meilisearch at ${host} - search falls back to PostgreSQL. ` +
          `(${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  private requireClient(): MeilisearchClient {
    if (!this.client) throw new Error('Meilisearch client is not configured');
    return this.client;
  }

  /** Declares searchable, filterable and sortable attributes once at startup. */
  private async ensureIndex(): Promise<void> {
    if (!this.client) return;

    await this.client.createIndex(PRODUCT_INDEX, 'id');

    await this.client.updateSettings(PRODUCT_INDEX, {
      searchableAttributes: ['name', 'brand', 'tags', 'shortDescription', 'description', 'sku'],
      filterableAttributes: [
        'categoryId',
        'categorySlug',
        'brand',
        'price',
        'rating',
        'inStock',
        'isFeatured',
      ],
      sortableAttributes: ['price', 'createdAt', 'rating', 'reviewCount'],
      // Typo tolerance is the reason Meilisearch is here (A1.3 "handles typos").
      typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
      faceting: { maxValuesPerFacet: 200 },
    });
  }

  /* --- Sync ------------------------------------------------------------- */

  /** Called on product create and update. Never throws - a sync failure must
   *  not roll back a successful write. */
  async upsertProducts(documents: ProductDocument[]): Promise<void> {
    if (!this.available || documents.length === 0) return;

    try {
      await this.requireClient().addDocuments(PRODUCT_INDEX, documents, 'id');
    } catch (error) {
      this.logger.error(
        `Meilisearch upsert failed for ${documents.length} product(s): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async removeProduct(productId: string): Promise<void> {
    if (!this.available) return;

    try {
      await this.requireClient().deleteDocument(PRODUCT_INDEX, productId);
    } catch (error) {
      this.logger.error(
        `Meilisearch delete failed for ${productId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Rebuilds the whole index. Used by the admin reindex endpoint and seeding. */
  async reindexAll(documents: ProductDocument[]): Promise<{ indexed: number; engine: string }> {
    if (!this.available) {
      return { indexed: 0, engine: 'postgres (Meilisearch unavailable)' };
    }

    await this.requireClient().deleteAllDocuments(PRODUCT_INDEX);
    await this.requireClient().addDocuments(PRODUCT_INDEX, documents, 'id');
    return { indexed: documents.length, engine: 'meilisearch' };
  }

  /* --- Query ------------------------------------------------------------ */

  async search(query: SearchQueryInput): Promise<SearchOutcome> {
    if (this.available) {
      try {
        return await this.searchWithMeilisearch(query);
      } catch (error) {
        this.logger.error(
          `Meilisearch query failed, falling back to PostgreSQL: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return this.searchWithPostgres(query);
  }

  private async searchWithMeilisearch(query: SearchQueryInput): Promise<SearchOutcome> {
    const filters: string[] = ['inStock = true OR inStock = false'];

    if (query.category) filters.push(`categorySlug = "${escapeFilter(query.category)}"`);
    if (query.brand) filters.push(`brand = "${escapeFilter(query.brand)}"`);
    if (query.minPrice !== undefined) filters.push(`price >= ${query.minPrice}`);
    if (query.maxPrice !== undefined) filters.push(`price <= ${query.maxPrice}`);

    const result = await this.requireClient().search<{ id: string }>(PRODUCT_INDEX, {
      q: query.q,
      offset: (query.page - 1) * query.limit,
      limit: query.limit,
      filter: filters.join(' AND '),
      sort: meiliSort(query.sort),
      facets: ['categorySlug', 'brand', 'price'],
      attributesToRetrieve: ['id'],
    });

    const distribution = result.facetDistribution ?? {};
    const stats = result.facetStats ?? {};

    return {
      ids: result.hits.map((hit) => hit.id),
      total: result.estimatedTotalHits ?? result.hits.length,
      engine: 'meilisearch',
      facets: {
        categories: Object.entries(distribution.categorySlug ?? {}).map(([value, count]) => ({
          value,
          label: value,
          count,
        })),
        brands: Object.entries(distribution.brand ?? {}).map(([value, count]) => ({
          value,
          count,
        })),
        priceRange: {
          min: stats.price?.min ?? 0,
          max: stats.price?.max ?? 0,
        },
      },
    };
  }

  /**
   * D3 fallback. Uses `contains` rather than tsvector because the generated
   * tsvector column is a manual migration (see prisma/migrations/README.md) and
   * may not exist yet; this works on a plain schema and is fast enough at
   * launch volume.
   */
  private async searchWithPostgres(query: SearchQueryInput): Promise<SearchOutcome> {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      deletedAt: null,
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { brand: { contains: query.q, mode: 'insensitive' } },
          { shortDescription: { contains: query.q, mode: 'insensitive' } },
          { tags: { has: query.q.toLowerCase() } },
        ],
      }),
      ...(query.category && { category: { slug: query.category } }),
      ...(query.brand && { brand: query.brand }),
      ...((query.minPrice !== undefined || query.maxPrice !== undefined) && {
        basePrice: {
          ...(query.minPrice !== undefined && { gte: query.minPrice }),
          ...(query.maxPrice !== undefined && { lte: query.maxPrice }),
        },
      }),
    };

    const [rows, total, brandGroups, priceAggregate] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: { id: true },
        orderBy: prismaSort(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.groupBy({
        by: ['brand'],
        where,
        _count: { _all: true },
      }),
      this.prisma.product.aggregate({
        where,
        _min: { basePrice: true },
        _max: { basePrice: true },
      }),
    ]);

    return {
      ids: rows.map((row) => row.id),
      total,
      engine: 'postgres',
      facets: {
        // Category facets need a join per category; the listing endpoint already
        // supplies the tree with counts, so they are left empty here.
        categories: [],
        brands: brandGroups
          .filter((group): group is typeof group & { brand: string } => !!group.brand)
          .map((group) => ({ value: group.brand, count: group._count._all })),
        priceRange: {
          min: Number(priceAggregate._min.basePrice ?? 0),
          max: Number(priceAggregate._max.basePrice ?? 0),
        },
      },
    };
  }
}

function meiliSort(sort: SearchQueryInput['sort']): string[] | undefined {
  switch (sort) {
    case 'price_asc':
      return ['price:asc'];
    case 'price_desc':
      return ['price:desc'];
    case 'newest':
      return ['createdAt:desc'];
    case 'rating':
      return ['rating:desc'];
    case 'popular':
      return ['reviewCount:desc'];
    default:
      // Undefined keeps Meilisearch's relevance ranking, which is what a text
      // query should default to.
      return undefined;
  }
}

function prismaSort(sort: SearchQueryInput['sort']): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case 'price_asc':
      return { basePrice: 'asc' };
    case 'price_desc':
      return { basePrice: 'desc' };
    case 'popular':
      return { viewCount: 'desc' };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

/** Meilisearch filter values are double-quoted, so inner quotes must escape. */
function escapeFilter(value: string): string {
  return value.replace(/"/g, '\\"');
}
