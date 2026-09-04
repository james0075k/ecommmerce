import { Module } from '@nestjs/common';

import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/**
 * Read-only for now. Submission, moderation and helpful votes are Phase 7; this
 * exists so the AI review summary has the individual reviews to sit above.
 */
@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
