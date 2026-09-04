import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  generateDescriptionSchema,
  summarizeReviewsSchema,
  UserRole,
} from '@bazaar/shared';
import type {
  AiReviewSummary,
  GenerateDescriptionInput,
  GeneratedDescription,
  SummarizeReviewsInput,
} from '@bazaar/shared';

import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProductCopyService } from './product-copy.service';
import { ReviewSummaryService } from './review-summary.service';

/**
 * The admin panel's AI tools. Every route requires ADMIN; SUPER_ADMIN satisfies
 * it via RolesGuard.
 *
 * Throttled per operator because each route is a paid model call, and a stuck
 * "Generate" button that fires on every keystroke should cost a 429 rather than
 * a bill.
 */
@Controller('admin/ai')
@Roles(UserRole.ADMIN)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AdminAiController {
  constructor(
    private readonly copy: ProductCopyService,
    private readonly summaries: ReviewSummaryService,
  ) {}

  /**
   * Drafts a product description in English and Nepali.
   *
   * Returns the copy; it does not save it. The operator edits the draft in the
   * form and saves the product as they always would, so nothing an AI wrote
   * reaches the storefront without a person having looked at it.
   */
  @Post('generate-description')
  generateDescription(
    @Body(new ZodValidationPipe(generateDescriptionSchema)) dto: GenerateDescriptionInput,
  ): Promise<GeneratedDescription> {
    return this.copy.generateDescription(dto);
  }

  @Post('summarize-reviews')
  summarizeReviews(
    @Body(new ZodValidationPipe(summarizeReviewsSchema)) dto: SummarizeReviewsInput,
  ): Promise<AiReviewSummary> {
    return this.summaries.summarize(dto.productId, dto.force);
  }
}
