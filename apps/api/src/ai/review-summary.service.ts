import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReviewSentiment } from '@prisma/client';
import { z } from 'zod';
import {
  REVIEW_SENTIMENTS,
  REVIEW_SUMMARY_MIN_REVIEWS,
  REVIEW_SUMMARY_STALE_AFTER,
} from '@bazaar/shared';
import type { AiReviewSummary } from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ClaudeService, type JsonSchemaObject } from './claude.service';

/** How many reviews are read. Enough for consensus, short enough to stay cheap. */
const SAMPLE_SIZE = 60;

/** Seconds a generation lock is held, so a burst of views makes one call. */
const LOCK_TTL = 120;

const responseSchema = z.object({
  positives: z.array(z.string().min(1)).min(1).max(6),
  negatives: z.array(z.string().min(1)).max(6),
  sentiment: z.enum(REVIEW_SENTIMENTS),
  summary: z.string().min(1).max(1200),
});

const OUTPUT_SCHEMA: JsonSchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['positives', 'negatives', 'sentiment', 'summary'],
  properties: {
    positives: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'string' },
      description:
        'Short noun phrases for what reviewers repeatedly praise, e.g. "Great quality", "Fast delivery". Two to four words each.',
    },
    negatives: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string' },
      description:
        'Short noun phrases for recurring complaints, e.g. "Runs small". Empty only if there genuinely are none.',
    },
    sentiment: {
      type: 'string',
      enum: [...REVIEW_SENTIMENTS],
      description: 'The overall balance of the reviews.',
    },
    summary: {
      type: 'string',
      description:
        'Two or three sentences a shopper can read instead of the reviews. Third person, no marketing language.',
    },
  },
};

const SYSTEM_PROMPT = `You summarise customer reviews for Bazaar, an online store in Nepal.

You will be given the approved reviews for one product. Report only what the reviews say.

Rules:
- Summarise the consensus, not individual opinions. A complaint raised once by one reviewer is not a recurring negative.
- Never invent praise or a complaint that is not in the reviews, and never soften a genuine, repeated complaint.
- If the reviews are mostly positive with a real recurring caveat, the sentiment is "MIXED", not "POSITIVE".
- Write in plain English for a shopper who has not read any of the reviews. No marketing language, no exclamation marks.`;

/**
 * E4: the "what buyers say" card above the review list.
 *
 * Generation is lazy and idempotent. The public read triggers it when a product
 * crosses the review threshold and nothing fresh is stored, so no cron job has
 * to know which products became eligible overnight; an admin can also force one
 * from the panel. A Redis lock keeps a product that suddenly gets traffic from
 * firing one model call per concurrent page view.
 */
@Injectable()
export class ReviewSummaryService {
  private readonly logger = new Logger(ReviewSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly claude: ClaudeService,
  ) {}

  /**
   * What the product page reads.
   *
   * Returns null - not an error - for a product with too few reviews or with
   * AI switched off. The card simply does not render, and the review list below
   * it is unaffected.
   */
  async forProduct(productId: string): Promise<AiReviewSummary | null> {
    const [stored, reviewCount] = await Promise.all([
      this.prisma.reviewSummary.findUnique({ where: { productId } }),
      this.countApproved(productId),
    ]);

    if (reviewCount < REVIEW_SUMMARY_MIN_REVIEWS) return stored ? toDto(stored) : null;

    const stale = !stored || reviewCount - stored.reviewCount >= REVIEW_SUMMARY_STALE_AFTER;

    if (stale && this.claude.isConfigured() && (await this.acquireLock(productId))) {
      try {
        return await this.generate(productId, reviewCount);
      } catch (error) {
        // A failed regeneration must not take down the product page: a slightly
        // out-of-date summary beats an error, and no summary beats both.
        this.logger.warn(
          `Could not refresh the review summary for ${productId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return stored ? toDto(stored) : null;
  }

  /**
   * POST /admin/ai/summarize-reviews.
   *
   * Unlike the read path this throws: an operator who clicked a button is owed
   * a reason when nothing happened.
   */
  async summarize(productId: string, force: boolean): Promise<AiReviewSummary> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found.');

    const reviewCount = await this.countApproved(productId);

    if (reviewCount < REVIEW_SUMMARY_MIN_REVIEWS) {
      throw new NotFoundException(
        `This product has ${reviewCount} approved review${reviewCount === 1 ? '' : 's'}; ` +
          `${REVIEW_SUMMARY_MIN_REVIEWS} are needed before a summary is worth writing.`,
      );
    }

    if (!force) {
      const stored = await this.prisma.reviewSummary.findUnique({ where: { productId } });
      if (stored && reviewCount - stored.reviewCount < REVIEW_SUMMARY_STALE_AFTER) {
        return toDto(stored);
      }
    }

    return this.generate(productId, reviewCount);
  }

  /* ---------------------------------------------------------------------- */

  private async generate(productId: string, reviewCount: number): Promise<AiReviewSummary> {
    const [product, reviews] = await Promise.all([
      this.prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { name: true, category: { select: { name: true } } },
      }),
      this.prisma.review.findMany({
        where: { productId, isApproved: true },
        select: { rating: true, title: true, body: true, isVerifiedPurchase: true },
        orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
        take: SAMPLE_SIZE,
      }),
    ]);

    const result = await this.claude.json({
      system: SYSTEM_PROMPT,
      jsonSchema: OUTPUT_SCHEMA,
      validator: responseSchema,
      maxTokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            `Product: ${product.name} (${product.category.name})`,
            `Approved reviews: ${reviewCount} in total, ${reviews.length} included below.`,
            '',
            ...reviews.map(
              (review, index) =>
                `${index + 1}. [${review.rating}/5${review.isVerifiedPurchase ? ', verified purchase' : ''}] ` +
                `${review.title ? `${review.title} - ` : ''}${review.body}`,
            ),
          ].join('\n'),
        },
      ],
    });

    const saved = await this.prisma.reviewSummary.upsert({
      where: { productId },
      create: {
        productId,
        positives: result.positives,
        negatives: result.negatives,
        sentiment: result.sentiment as ReviewSentiment,
        summary: result.summary,
        reviewCount,
        model: this.claude.modelId(),
      },
      update: {
        positives: result.positives,
        negatives: result.negatives,
        sentiment: result.sentiment as ReviewSentiment,
        summary: result.summary,
        reviewCount,
        model: this.claude.modelId(),
        generatedAt: new Date(),
      },
    });

    return toDto(saved);
  }

  private countApproved(productId: string): Promise<number> {
    return this.prisma.review.count({ where: { productId, isApproved: true } });
  }

  /** True when this request won the right to generate. */
  private async acquireLock(productId: string): Promise<boolean> {
    const key = `ai:review-summary:${productId}`;
    // increment() sets the TTL on first write, so the first caller through gets
    // 1 and everyone else inside the window gets a number greater than 1.
    return (await this.redis.increment(key, LOCK_TTL)) === 1;
  }
}

interface StoredSummary {
  productId: string;
  positives: string[];
  negatives: string[];
  sentiment: ReviewSentiment;
  summary: string;
  reviewCount: number;
  generatedAt: Date;
}

function toDto(row: StoredSummary): AiReviewSummary {
  return {
    productId: row.productId,
    positives: row.positives,
    negatives: row.negatives,
    sentiment: row.sentiment,
    summary: row.summary,
    reviewCount: row.reviewCount,
    generatedAt: row.generatedAt.toISOString(),
  };
}
