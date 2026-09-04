'use client';

import * as React from 'react';

/** Everything the browser will let a keyboard reach, in document order. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps Tab inside an open layer and gives focus back when it closes.
 *
 * Every full-screen layer in the storefront - the cart drawer, the search
 * takeover, the quick-view sheet - is a dialog rendered at the end of the body
 * while the page behind it is still in the tab order. Without this, tabbing out
 * of the panel walks a keyboard or screen-reader user into content that is
 * visually covered and, as far as they can tell, gone.
 *
 * Three things happen, in the order they matter:
 *
 *  - The element that opened the layer is remembered, and focus returns to it
 *    on close. Losing your place in a product grid because you glanced at the
 *    cart is the single most common keyboard regression in a shop.
 *  - Focus moves to the first focusable element inside, or to the container
 *    itself when there is none, so the next Tab starts from the right place.
 *  - Tab and Shift+Tab wrap at the ends of the panel.
 *
 * Radix owns this for the components built on it (`Sheet`, `Dialog`); this is
 * for the layers that are hand-built because they needed the blueprint's own
 * easing curves.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
): void {
  // Captured in a ref rather than state: restoring focus must not depend on a
  // render having happened, and the value is read exactly once, on close.
  const restoreTo = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!active) return;

    restoreTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // A frame's grace: the panel is usually mid-enter-animation on the first
    // effect pass, and focusing an element that has not been laid out yet makes
    // Safari scroll the page behind the layer.
    const frame = requestAnimationFrame(() => {
      const container = ref.current;
      if (!container) return;
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? container).focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const container = ref.current;
      if (!container) return;

      const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        // `offsetParent` is null for anything `display: none`, which is what a
        // collapsed section inside the panel looks like.
        (element) => element.offsetParent !== null || element === document.activeElement,
      );

      if (focusable.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);

      // Only take focus back if it is still inside the layer being torn down.
      // A close triggered by clicking a link on the page behind has already
      // moved focus somewhere deliberate, and stealing it back would undo that.
      const target = restoreTo.current;
      if (!target || !target.isConnected) return;
      if (document.activeElement !== document.body && !ref.current?.contains(document.activeElement)) {
        return;
      }
      target.focus({ preventScroll: true });
    };
  }, [active, ref]);
}

/**
 * Locks the page behind a layer.
 *
 * `overflow: hidden` on `<body>` alone does not hold on iOS Safari - touch
 * scrolling falls through to the document - so the position is pinned and
 * restored, with the scroll offset preserved across the lock. The scrollbar
 * width is compensated on desktop so the page does not jump sideways when it
 * disappears.
 */
export function useScrollLock(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;

    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const gutter = window.innerWidth - documentElement.clientWidth;

    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;

    return () => {
      Object.assign(body.style, previous);
      // Restoring the offset has to be synchronous with un-pinning, or the page
      // flashes at the top for a frame.
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
    };
  }, [active]);
}
