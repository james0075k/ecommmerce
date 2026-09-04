'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Loader2, ThumbsUp } from 'lucide-react';

import { formatDate } from '@bazaar/ui';

import { StarRating } from '@/components/shop/star-rating';
import { Button } from '@/components/ui/button';
import { fetchReviews } from '@/lib/ai';

const PAGE_SIZE = 5;

/**
 * The individual reviews the AI summary sits above.
 *
 * Read-only: writing reviews is Phase 7. Paginated rather than infinite because
 * this lives inside a tab panel, and a list that grows without bound pushes the
 * rest of the page - including the recommendation rail - permanently out of
 * reach.
 */
export function ReviewList({ productId }: { productId: string }) {
  const [page, setPage] = React.useState(1);

  const { data, isPending, isError } = useQuery({
    queryKey: ['reviews', 'list', productId, page],
    queryFn: () => fetchReviews(productId, page, PAGE_SIZE),
    staleTime: 60_000,
    retry: false,
  });

  if (isPending) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading reviews…
      </p>
    );
  }

  if (isError || !data || data.items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No reviews yet. Writing reviews opens in Phase 7 — only verified purchasers will be able
        to post.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {data.items.map((review) => (
          <li key={review.id} className="border-b border-border pb-4 last:border-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <StarRating rating={review.rating} />
              <span className="text-sm font-medium">{review.authorName}</span>
              {review.isVerifiedPurchase ? (
                <span className="flex items-center gap-1 text-xs text-ok">
                  <BadgeCheck className="size-3.5" aria-hidden />
                  Verified purchase
                </span>
              ) : null}
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(review.createdAt)}
              </span>
            </div>

            {review.title ? <p className="mt-2 text-sm font-medium">{review.title}</p> : null}
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{review.body}</p>

            {review.helpfulCount > 0 ? (
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <ThumbsUp className="size-3" aria-hidden />
                {review.helpfulCount} found this helpful
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!data.meta.hasPrev}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <p className="numeric text-xs text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!data.meta.hasNext}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
