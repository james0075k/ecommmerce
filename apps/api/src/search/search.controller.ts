import { Controller, Get, Query } from '@nestjs/common';
import { searchQuerySchema } from '@bazaar/shared';
import type { SearchQueryInput } from '@bazaar/shared';

import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /search?q=... - faceted product search.
   *
   * Meilisearch returns ids; the rows are then read from Postgres so the payload
   * matches GET /products exactly and the frontend can reuse one card component.
   */
  @Public()
  @Get()
  async search_(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQueryInput,
  ) {
    const outcome = await this.search.search(query);

    const rows = await this.prisma.product.findMany({
      where: { id: { in: outcome.ids }, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        shortDescription: true,
        basePrice: true,
        compareAtPrice: true,
        currency: true,
        brand: true,
        tags: true,
        isFeatured: true,
        category: { select: { id: true, name: true, slug: true } },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { url: true, altText: true, blurhash: true },
        },
        variants: { where: { isActive: true }, select: { stockQuantity: true } },
      },
    });

    // findMany does not preserve the ranking order, so restore it.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = outcome.ids
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => !!row);

    const totalPages = Math.max(1, Math.ceil(outcome.total / query.limit));

    return {
      items: ordered.map((row) => {
        const stockQuantity = row.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
        const image = row.images[0];
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          sku: row.sku,
          shortDescription: row.shortDescription,
          price: Number(row.basePrice),
          compareAtPrice: row.compareAtPrice === null ? null : Number(row.compareAtPrice),
          currency: row.currency,
          brand: row.brand,
          tags: row.tags,
          isFeatured: row.isFeatured,
          category: row.category,
          image: image
            ? { url: image.url, altText: image.altText, blurhash: image.blurhash }
            : null,
          rating: 0,
          reviewCount: 0,
          inStock: stockQuantity > 0,
          stockQuantity,
        };
      }),
      meta: {
        page: query.page,
        limit: query.limit,
        total: outcome.total,
        totalPages,
        hasNext: query.page < totalPages,
        hasPrev: query.page > 1,
      },
      facets: outcome.facets,
      // Surfaced so the UI can tell shoppers when typo tolerance is unavailable.
      engine: outcome.engine,
    };
  }
}
