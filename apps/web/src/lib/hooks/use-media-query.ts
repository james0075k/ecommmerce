'use client';

import * as React from 'react';

/**
 * Subscribes to a CSS media query.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: matchMedia is an
 * external store, and reading it in an effect means one render with the wrong
 * answer followed by a second with the right one. The server snapshot is
 * `false`, so anything gated on this is absent from the HTML and appears on
 * hydration - which is correct for effects that only exist on a real pointer.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The desktop pointer test every hover-driven effect in the app shares. */
export function useFinePointer(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)');
}

/**
 * Whether the browser is currently online.
 *
 * Same reasoning as above - `navigator.onLine` plus two window events is an
 * external store. The server assumes online, which is what every page already
 * renders for.
 */
export function useOnlineStatus(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);
      return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * The one place the storefront decides what "mobile" means.
 *
 * 1024px, matching the `lg:` breakpoint the rest of the shell already uses -
 * the mobile menu, the filter sheet and the bottom navigation all appear
 * together, so a behaviour switch that disagreed with them would show a phone
 * layout driving a desktop interaction (or the reverse) at one width.
 *
 * Prefer a `lg:` Tailwind class for anything that can be expressed in CSS: this
 * returns `false` on the server, so a JS-gated element is absent from the HTML
 * and appears on hydration. Use it only where the *behaviour* differs - opening
 * the cart drawer versus navigating to the cart page.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1023.98px)');
}
