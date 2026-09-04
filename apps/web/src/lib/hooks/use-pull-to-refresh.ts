'use client';

import * as React from 'react';

/** How far down the finger has to travel before the refresh commits. */
const THRESHOLD_PX = 72;

/** Past this the indicator stops following, so the gesture cannot be dragged out. */
const MAX_PULL_PX = 110;

/** Below 1 the indicator lags the finger, which is what makes it feel elastic. */
const RESISTANCE = 0.5;

export interface PullToRefresh {
  /** 0 while idle, growing to `MAX_PULL_PX` as the finger travels. */
  distance: number;
  /** True from the moment the gesture commits until the promise settles. */
  isRefreshing: boolean;
  /** True once the finger has travelled far enough to commit on release. */
  isArmed: boolean;
  /** Spread onto the scroll container. */
  handlers: {
    onTouchStart: (event: React.TouchEvent) => void;
    onTouchMove: (event: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

/**
 * Pull-to-refresh for the product listing.
 *
 * Touch events rather than pointer events on purpose: this needs
 * `preventDefault` on move to stop the browser's own overscroll from taking the
 * gesture, and that is only possible on a non-passive touch listener. React
 * attaches its listeners passively, so `onTouchMove` here cannot call
 * `preventDefault` - the container carries `overscroll-behavior-y: contain`
 * instead, which stops the bounce without needing to.
 *
 * The gesture only starts at the very top of the page. Anywhere else a downward
 * drag is a scroll, and hijacking it would make the listing feel broken.
 */
export function usePullToRefresh(
  onRefresh: () => Promise<unknown>,
  enabled = true,
): PullToRefresh {
  const [distance, setDistance] = React.useState(0);
  const [isRefreshing, setRefreshing] = React.useState(false);

  const startY = React.useRef<number | null>(null);
  // The callback changes identity on every render of the caller; reading it
  // through a ref keeps the handlers stable. Assigned in an effect rather than
  // during render, so a discarded render cannot leave the ref pointing at a
  // callback that was never committed.
  const refresh = React.useRef(onRefresh);

  React.useEffect(() => {
    refresh.current = onRefresh;
  }, [onRefresh]);

  const onTouchStart = (event: React.TouchEvent) => {
    if (!enabled || isRefreshing) return;
    if (window.scrollY > 0) return;
    startY.current = event.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (event: React.TouchEvent) => {
    const start = startY.current;
    if (start === null) return;

    const delta = (event.touches[0]?.clientY ?? start) - start;

    if (delta <= 0) {
      // Upward, or back past the start - hand the gesture back to the scroller.
      startY.current = null;
      setDistance(0);
      return;
    }

    setDistance(Math.min(MAX_PULL_PX, delta * RESISTANCE));
  };

  const onTouchEnd = () => {
    const travelled = distance;
    startY.current = null;

    if (travelled < THRESHOLD_PX) {
      setDistance(0);
      return;
    }

    setRefreshing(true);
    // Park the indicator at the threshold while the request is in flight, so
    // the spinner has somewhere to sit.
    setDistance(THRESHOLD_PX);

    void Promise.resolve(refresh.current())
      .catch(() => {
        // A failed refresh is the caller's to report - the gesture's only job
        // is to end cleanly either way.
      })
      .finally(() => {
        setRefreshing(false);
        setDistance(0);
      });
  };

  return {
    distance,
    isRefreshing,
    isArmed: distance >= THRESHOLD_PX,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}

export const PULL_THRESHOLD_PX = THRESHOLD_PX;
