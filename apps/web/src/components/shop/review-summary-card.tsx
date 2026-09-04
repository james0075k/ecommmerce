'use client';

import { useQuery } from '@tanstack/react-query';
import { Minus, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';

import type { AiReviewSummary, ReviewSentiment } from '@bazaar/shared';

import { fetchReviewSummary } from '@/lib/ai';
import { cn } from '@/lib/utils';

const SENTIMENT: Readonly<
  Record<ReviewSentiment, { label: string; className: string; Icon: typeof ThumbsUp }>
> = {
  POSITIVE: { label: 'Mostly positive', className: 'text-ok', Icon: ThumbsUp },
  MIXED: { label: 'Mixed', className: 'text-caution', Icon: Minus },
  NEGATIVE: { label: 'Mostly negative', className: 'text-destructive', Icon: ThumbsDown },
};

/**
 * E4: the AI consensus card, shown above the individual reviews.
 *
 * Renders nothing at all when the product has too few reviews or the server has
 * no summary - the endpoint answers `null` rather than an error for that case,
 * because four reviews is a normal state for a product, not a failure.
 *
 * It is labelled as AI-written and states how many reviews it read. A shopper
 * who wants to check it can scroll two inches and read them.
 */
export function ReviewSummaryCard({ productId }: { productId: string }) {
  const { data } = useQuery<AiReviewSummary | null>({
    queryKey: ['reviews', 'summary', productId],
    queryFn: () => fetchReviewSummary(productId),
    staleTime: 10 * 60_000,
    retry: false,
  });

  if (!data) return null;

  const sentiment = SENTIMENT[data.sentiment];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden />
          What buyers say
        </p>
        <p className={cn('flex items-center gap-1 text-xs font-medium', sentiment.className)}>
          <sentiment.Icon className="size-3.5" aria-hidden />
          {sentiment.label}
        </p>
        <p className="ml-auto text-xs text-muted-foreground">
          AI summary of {data.reviewCount} reviews
        </p>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{data.summary}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PointList
          title="Praised for"
          points={data.positives}
          className="text-ok"
          Icon={ThumbsUp}
        />
        {data.negatives.length > 0 ? (
          <PointList
            title="Watch out for"
            points={data.negatives}
            className="text-caution"
            Icon={ThumbsDown}
          />
        ) : null}
      </div>
    </div>
  );
}

function PointList({
  title,
  points,
  className,
  Icon,
}: {
  title: string;
  points: string[];
  className: string;
  Icon: typeof ThumbsUp;
}) {
  if (points.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="mt-2 space-y-1.5">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm">
            <Icon className={cn('mt-0.5 size-3.5 shrink-0', className)} aria-hidden />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
