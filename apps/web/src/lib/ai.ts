import type {
  AiReviewSummary,
  ChatHandoffInput,
  ChatReply,
  ChatRequestInput,
  GenerateDescriptionInput,
  GeneratedDescription,
  Paginated,
  PublicReview,
  RecommendationReason,
} from '@bazaar/shared';

import { apiFetch } from './api';
import type { ProductListItem } from './catalog';

/** A recommendation rail: the cards, plus why they are being shown. */
export interface RecommendationRail {
  items: ProductListItem[];
  reason: RecommendationReason;
}

export interface ChatConfig {
  available: boolean;
  greeting: string;
  quickActions: ReadonlyArray<{ id: string; label: string; prompt: string }>;
}

/* -------------------------------------------------------------------------- */
/*  Chat                                                                      */
/* -------------------------------------------------------------------------- */

export function fetchChatConfig(): Promise<ChatConfig> {
  return apiFetch<ChatConfig>('/ai/chat/config');
}

export function sendChatMessage(body: ChatRequestInput): Promise<ChatReply> {
  return apiFetch<ChatReply>('/ai/chat', { method: 'POST', body });
}

export function requestHumanHandoff(
  body: ChatHandoffInput,
): Promise<{ contactMessageId: string }> {
  return apiFetch<{ contactMessageId: string }>('/ai/chat/handoff', {
    method: 'POST',
    body,
  });
}

/* -------------------------------------------------------------------------- */
/*  Recommendations                                                           */
/* -------------------------------------------------------------------------- */

export function fetchProductRecommendations(productId: string): Promise<RecommendationRail> {
  return apiFetch<RecommendationRail>(`/products/${productId}/recommendations`);
}

export function fetchRecommendedForYou(): Promise<RecommendationRail> {
  return apiFetch<RecommendationRail>('/recommendations/for-you');
}

/**
 * Records a product view.
 *
 * Deliberately swallows its own errors: this is telemetry for a recommendation
 * rail, and a shopper reading a product page should never see a toast because
 * the history store was unreachable.
 */
export function trackProductView(productId: string): void {
  void apiFetch<void>('/recommendations/track', {
    method: 'POST',
    body: { productId },
  }).catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/*  Reviews                                                                   */
/* -------------------------------------------------------------------------- */

export function fetchReviewSummary(productId: string): Promise<AiReviewSummary | null> {
  return apiFetch<AiReviewSummary | null>(`/products/${productId}/review-summary`);
}

export function fetchReviews(
  productId: string,
  page = 1,
  limit = 5,
): Promise<Paginated<PublicReview>> {
  return apiFetch<Paginated<PublicReview>>(
    `/products/${productId}/reviews?page=${page}&limit=${limit}`,
  );
}

/* -------------------------------------------------------------------------- */
/*  Admin                                                                     */
/* -------------------------------------------------------------------------- */

export function generateProductDescription(
  body: GenerateDescriptionInput,
): Promise<GeneratedDescription> {
  return apiFetch<GeneratedDescription>('/admin/ai/generate-description', {
    method: 'POST',
    body,
  });
}

export function summarizeProductReviews(
  productId: string,
  force = true,
): Promise<AiReviewSummary> {
  return apiFetch<AiReviewSummary>('/admin/ai/summarize-reviews', {
    method: 'POST',
    body: { productId, force },
  });
}
