import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AiReviewSummary } from '@bazaar/shared';

import { Public } from '../common/decorators/public.decorator';
import { ReviewSummaryService } from './review-summary.service';

/**
 * `GET /products/:id/review-summary` - the card above the review list.
 *
 * Returns `null` rather than 404 when there is nothing to show: a product with
 * four reviews is a normal product, not a missing resource, and the card simply
 * does not render. This is also where a summary is first generated, once a
 * product crosses the review threshold - see ReviewSummaryService.
 */
@Controller('products')
export class ReviewSummaryController {
  constructor(private readonly summaries: ReviewSummaryService) {}

  @Public()
  @Get(':id/review-summary')
  forProduct(@Param('id', ParseUUIDPipe) id: string): Promise<AiReviewSummary | null> {
    return this.summaries.forProduct(id);
  }
}
