import { z } from 'zod';

import {
  AI_CHAT_HISTORY_LIMIT,
  AI_CHAT_MAX_MESSAGE,
  AI_TONES,
  BROWSE_HISTORY_LIMIT,
} from '../constants.js';
import { jsonSchema, uuidSchema } from './common.js';

/* -------------------------------------------------------------------------- */
/*  1. Product description generator                                          */
/* -------------------------------------------------------------------------- */

/**
 * What the admin form sends when it asks for copy.
 *
 * Only `productName` is required. Everything else is context the model writes
 * better with and can do without - an operator who clicks "Generate" before
 * filling in the brand should get a description, not a validation error.
 */
export const generateDescriptionSchema = z.object({
  productName: z.string().trim().min(2, 'Product name is required').max(200),
  category: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(80).optional(),
  /** The product's JSONB attributes - colour, size, material, and so on. */
  attributes: z.record(jsonSchema).default({}),
  tags: z.array(z.string().max(40)).max(30).default([]),
  /** In NPR. Shapes how the copy pitches value. */
  price: z.number().nonnegative().max(99_999_999).optional(),
  tone: z.enum(AI_TONES).default('professional'),
});

export type GenerateDescriptionInput = z.infer<typeof generateDescriptionSchema>;

/** One language's worth of copy. `descriptionHtml` is sanitised server-side. */
export interface GeneratedCopy {
  shortDescription: string;
  descriptionHtml: string;
}

export interface GeneratedDescription {
  english: GeneratedCopy;
  nepali: GeneratedCopy;
  /** Ready to drop into the SEO card of the product form. */
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  /** Both languages stitched together - what the description editor receives. */
  combinedHtml: string;
  model: string;
}

/* -------------------------------------------------------------------------- */
/*  2. Chatbot                                                                */
/* -------------------------------------------------------------------------- */

export const chatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

export type ChatTurn = z.infer<typeof chatTurnSchema>;

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Say something first').max(AI_CHAT_MAX_MESSAGE),
  /**
   * The client owns the transcript. The API is stateless here on purpose: no
   * conversation table to grow unbounded, and closing the tab genuinely ends
   * the conversation rather than leaving a half-finished one on a server.
   */
  conversationHistory: z.array(chatTurnSchema).max(AI_CHAT_HISTORY_LIMIT).default([]),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

/** A product the assistant referenced, rendered as a card under the reply. */
export interface ChatProductRef {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency: string;
  imageUrl: string | null;
}

/** An order the assistant looked up, rendered as a status chip. */
export interface ChatOrderRef {
  id: string;
  orderNumber: string;
  status: string;
  placedAt: string;
  total: number;
  trackingNumber: string | null;
}

export interface ChatReply {
  reply: string;
  /** Follow-up buttons the model suggested, if any. */
  suggestions: string[];
  products: ChatProductRef[];
  orders: ChatOrderRef[];
  /**
   * Set when the assistant gave up and filed a ticket on the shopper's behalf.
   * Only possible for a signed-in shopper - their name and email are already
   * known, so nothing has to be asked for.
   */
  handoff: { contactMessageId: string; subject: string } | null;
  /**
   * Set when the assistant gave up for a *guest*. There is no address to reply
   * to, so the widget collects one and posts it to `/ai/chat/handoff`.
   */
  handoffRequested: { subject: string; summary: string } | null;
}

/**
 * Sent when the visitor asks for a human and the assistant needs a way to reach
 * them back. Name and email are only collected at that point - the widget never
 * asks for them up front.
 */
export const chatHandoffSchema = z.object({
  name: z.string().trim().min(2, 'Your name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z.string().trim().max(20).optional(),
  subject: z.string().trim().min(2).max(200),
  message: z.string().trim().min(2).max(5000),
});

export type ChatHandoffInput = z.infer<typeof chatHandoffSchema>;

/* -------------------------------------------------------------------------- */
/*  3. Recommendations                                                        */
/* -------------------------------------------------------------------------- */

// RECOMMENDATION_REASONS, RecommendationReason and RECOMMENDATION_REASON_LABELS
// moved to ../constants.ts in Phase 11. They are a list of strings and a label
// map with no Zod in them, and living here meant that a product card importing
// the labels pulled every schema in this package - 21KB gzipped of validation
// code - onto the storefront.
export { RECOMMENDATION_REASONS, RECOMMENDATION_REASON_LABELS } from '../constants.js';
export type { RecommendationReason } from '../constants.js';

export const trackProductViewSchema = z.object({
  productId: uuidSchema,
});

export type TrackProductViewInput = z.infer<typeof trackProductViewSchema>;

export const browseHistorySchema = z.object({
  productIds: z.array(uuidSchema).max(BROWSE_HISTORY_LIMIT),
});

export type BrowseHistory = z.infer<typeof browseHistorySchema>;

/* -------------------------------------------------------------------------- */
/*  4. Review summarisation                                                   */
/* -------------------------------------------------------------------------- */

export const summarizeReviewsSchema = z.object({
  productId: uuidSchema,
  /** Regenerate even when a fresh summary already exists. */
  force: z.boolean().default(false),
});

export type SummarizeReviewsInput = z.infer<typeof summarizeReviewsSchema>;

export const REVIEW_SENTIMENTS = ['POSITIVE', 'MIXED', 'NEGATIVE'] as const;
export type ReviewSentiment = (typeof REVIEW_SENTIMENTS)[number];

export interface AiReviewSummary {
  productId: string;
  positives: string[];
  negatives: string[];
  sentiment: ReviewSentiment;
  summary: string;
  /** How many reviews were read to produce this - shown on the card. */
  reviewCount: number;
  generatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Reviews (read-only listing, so the summary card has something to sit on)   */
/* -------------------------------------------------------------------------- */

export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  images: string[];
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  authorName: string;
  createdAt: string;
}
