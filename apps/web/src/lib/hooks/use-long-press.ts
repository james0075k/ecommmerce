'use client';

import * as React from 'react';

/** Android's own long-press threshold. Anything shorter fires on a slow tap. */
const HOLD_MS = 500;

/** Past this much movement it is a scroll, not a hold. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Long-press, for touch only.
 *
 * Returns props to spread onto the element. The handlers are pointer events
 * rather than touch events so a stylus counts, and the gesture is abandoned the
 * moment the finger travels far enough to be a scroll - a product grid is a
 * vertical scroller first, and a quick-view sheet that opens because someone
 * paused mid-flick is a bug, not a feature.
 *
 * Mouse and pen pointers are ignored outright: on a desktop the equivalent
 * affordance is hover, which the card already has.
 */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = React.useRef<number | null>(null);
  const origin = React.useRef<{ x: number; y: number } | null>(null);
  // Set when the gesture fires, so the click that follows the release can be
  // swallowed instead of navigating to the product page underneath.
  const fired = React.useRef(false);

  const clear = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  React.useEffect(() => clear, [clear]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!enabled || event.pointerType !== 'touch') return;

    fired.current = false;
    origin.current = { x: event.clientX, y: event.clientY };

    timer.current = window.setTimeout(() => {
      fired.current = true;
      // A short buzz is the confirmation that the hold registered. Not every
      // device or browser exposes it, and none of them are required to.
      navigator.vibrate?.(12);
      onLongPress();
      clear();
    }, HOLD_MS);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const start = origin.current;
    if (!start) return;

    if (
      Math.abs(event.clientX - start.x) > MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - start.y) > MOVE_TOLERANCE_PX
    ) {
      clear();
    }
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (event: React.MouseEvent) => {
      // Chrome on Android raises the context menu at roughly the same moment
      // the timer fires; leaving it would put a "open image in new tab" sheet
      // on top of ours.
      if (fired.current) event.preventDefault();
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (!fired.current) return;
      event.preventDefault();
      event.stopPropagation();
      fired.current = false;
    },
  };
}
