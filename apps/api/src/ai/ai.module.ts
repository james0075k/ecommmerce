import { Module } from '@nestjs/common';

import { ProductsModule } from '../products/products.module';
import { AdminAiController } from './admin-ai.controller';
import { AiController } from './ai.controller';
import { ChatService } from './chat.service';
import { ClaudeService } from './claude.service';
import { ProductCopyService } from './product-copy.service';
import {
  ProductRecommendationsController,
  RecommendationsController,
} from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { ReviewSummaryController } from './review-summary.controller';
import { ReviewSummaryService } from './review-summary.service';

/**
 * Phase 10: description generation, the storefront chatbot, recommendations and
 * review summaries.
 *
 * The module depends on the catalogue (ProductsModule) and, through the global
 * AdminModule, on settings and the contact queue - never the other way round.
 * Nothing in the store has to know the AI module exists, which is what lets it
 * run degraded, or not at all, without taking anything else with it.
 *
 * ClaudeService is exported so a later phase can add an AI surface without
 * re-deriving how the client is configured.
 */
@Module({
  imports: [ProductsModule],
  controllers: [
    AiController,
    AdminAiController,
    ProductRecommendationsController,
    RecommendationsController,
    ReviewSummaryController,
  ],
  providers: [
    ClaudeService,
    ChatService,
    ProductCopyService,
    RecommendationsService,
    ReviewSummaryService,
  ],
  exports: [ClaudeService, RecommendationsService, ReviewSummaryService],
})
export class AiModule {}
