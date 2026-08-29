import { Controller, Get, Param, Query } from '@nestjs/common';
import { productQuerySchema } from '@bazaar/shared';
import type { CatalogFacets, Paginated, ProductQueryInput } from '@bazaar/shared';

import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProductsService } from './products.service';
import type { ProductListItem } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /**
   * GET /products
   * page, limit, sort, category, minPrice, maxPrice, brand, inStock, search.
   * Returns the page, total count and the facet counts the sidebar renders.
   */
  @Public()
  @Get()
  list(
    @Query(new ZodValidationPipe(productQuerySchema)) query: ProductQueryInput,
  ): Promise<Paginated<ProductListItem> & { facets: CatalogFacets }> {
    return this.products.list(query);
  }

  /** GET /products/:slug - detail with variants, images, review summary, related. */
  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug);
  }
}
