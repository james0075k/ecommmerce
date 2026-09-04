import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { trackProductViewSchema } from '@bazaar/shared';
import type { TrackProductViewInput } from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { ProductListItem } from '../products/products.service';
import { resolveBrowseKey } from './browse-session';
import { RecommendationsService, type RecommendationRail } from './recommendations.service';

/**
 * `GET /products/:id/recommendations`.
 *
 * A second controller on the `products` prefix rather than a method on
 * ProductsController: recommendations depend on the order book and on Redis,
 * and wiring those into the catalogue module would make every product query
 * carry the recommender's dependencies. The paths do not collide - the
 * catalogue's dynamic route is one segment deep, this one is two.
 */
@OptionalAuth()
@Controller('products')
export class ProductRecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get(':id/recommendations')
  forProduct(@Param('id', ParseUUIDPipe) id: string): Promise<RecommendationRail> {
    return this.recommendations.forProduct(id);
  }
}

/**
 * The personalised rail, and the browsing history that feeds it.
 *
 * Its own prefix because "recommended for you" is not scoped to a product, and
 * hanging it off `/products/...` would put it one segment deep, where it would
 * shadow the catalogue's `/products/:slug` route.
 */
@OptionalAuth()
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  /** The homepage rail. Falls back to popular products for a first-time visitor. */
  @Get('for-you')
  forYou(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RecommendationRail> {
    // `mutating: false` - reading the rail must not mint a cookie for every bot
    // that loads the homepage.
    return this.recommendations.forVisitor(
      resolveBrowseKey(user?.id, request, response, false),
    );
  }

  @Get('recently-viewed')
  recentlyViewed(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProductListItem[]> {
    return this.recommendations.recentlyViewed(
      resolveBrowseKey(user?.id, request, response, false),
    );
  }

  /**
   * Records a product view. Fired by the product page; deliberately cheap and
   * fire-and-forget from the client's side.
   */
  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  async track(
    @Body(new ZodValidationPipe(trackProductViewSchema)) dto: TrackProductViewInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const key = resolveBrowseKey(user?.id, request, response, true);
    if (key) await this.recommendations.recordView(key, dto.productId);
  }
}
