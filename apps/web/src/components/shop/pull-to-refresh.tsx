'use client';

import * as React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

import { PULL_THRESHOLD_PX, usePullToRefresh } from '@/lib/hooks/use-pull-to-refresh';
import { useFinePointer } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';

/**
 * Wraps a scrollable region with pull-to-refresh (Phase 11).
 *
 * The gesture is the one thing a phone offers that a mouse does not have an
 * equivalent for: on a listing whose stock and prices move, dragging down is
 * how people ask "is this still true?". There is no desktop counterpart worth
 * inventing, so on a fine pointer this renders its children and nothing else -
 * no listeners, no indicator, no wrapper state.
 *
 * The indicator lives above the content in normal flow, revealed by growing the
 * container's top padding as the finger travels. Overlaying it would need a
 * transform on the whole page, which on a long grid is a compositor layer the
 * size of the document.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  /** Resolve when the data is back; the indicator stays up until it does. */
  onRefresh: () => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
}) {
  const finePointer = useFinePointer();
  const { distance, isRefreshing, isArmed, handlers } = usePullToRefresh(
    onRefresh,
    !finePointer,
  );

  // The wrapper always renders, always with the caller's className - it is the
  // page's layout container, not a decoration this component owns. Only the
  // handlers and the indicator are conditional. Returning a bare fragment on a
  // fine pointer would drop `container-bazaar` on every desktop hydration,
  // which is a full-width listing where a centred one was server-rendered.
  return (
    <div
      {...(finePointer ? {} : handlers)}
      // `overscroll-y-contain` stops the browser's own bounce from swallowing
      // the drag. React attaches touch listeners passively, so the hook cannot
      // call preventDefault - this does the same job declaratively.
      className={cn(!finePointer && 'overscroll-y-contain', className)}
      style={
        finePointer
          ? undefined
          : {
              paddingTop: distance,
              // No transition while the finger is down, or the indicator lags
              // behind it; one on release so it springs back rather than snaps.
              transition:
                distance === 0 ? 'padding-top 220ms var(--bz-ease-out-expo)' : undefined,
            }
      }
    >
      {finePointer ? null : (
        <div
          aria-hidden={!isRefreshing}
          className="pointer-events-none flex items-center justify-center overflow-hidden"
          style={{ height: distance, marginTop: -distance }}
        >
          <span
            className={cn(
              'grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-card transition-colors',
              (isArmed || isRefreshing) && 'text-primary',
            )}
            style={{
              // The icon turns a full circle over the pull, so the rotation
              // itself reads as a progress bar.
              transform: isRefreshing
                ? undefined
                : 'rotate(' + (distance / PULL_THRESHOLD_PX) * 360 + 'deg)',
              opacity: Math.min(1, distance / 24),
            }}
          >
            {isRefreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </span>
        </div>
      )}

      {/* Screen readers get the outcome rather than the gesture: the pull is a
          visual, motor interaction they are not performing. */}
      {finePointer ? null : (
        <span role="status" aria-live="polite" className="sr-only">
          {isRefreshing ? 'Refreshing products' : ''}
        </span>
      )}

      {children}
    </div>
  );
}
