import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { paginationSchema } from '@bazaar/shared';
import type { Paginated, PaginationInput, PublicReview } from '@bazaar/shared';

import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReviewsService } from './reviews.service';

/** `GET /products/:id/reviews` - approved reviews, most helpful first. */
@Controller('products')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get(':id/reviews')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationInput,
  ): Promise<Paginated<PublicReview>> {
    return this.reviews.listForProduct(id, query);
  }
}
