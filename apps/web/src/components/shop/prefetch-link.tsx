'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useFinePointer } from '@/lib/hooks/use-media-query';

/**
 * A product link that prefetches on intent rather than on sight (Phase 11).
 *
 * Next's default is to prefetch every link as it enters the viewport. On a
 * phone that is exactly right - there is no hover, the connection is the thing
 * being optimised for, and by the time a card is on screen a tap is imminent.
 *
 * On a desktop it is wasteful: a 1440px listing has sixteen cards in view at
 * once and the shopper will open one of them. So on a fine pointer the viewport
 * prefetch is turned off and the route is fetched on the first hover or focus
 * instead - which still lands well before the click, since the gap between
 * pointing at something and pressing it is a few hundred milliseconds.
 *
 * Focus counts as intent too, so a keyboard user gets the same head start.
 */
export function PrefetchLink({
  href,
  children,
  ...props
}: React.ComponentProps<typeof Link>) {
  const router = useRouter();
  const finePointer = useFinePointer();

  // Once per mount: `router.prefetch` de-duplicates internally, but a pointer
  // moving across a card fires this dozens of times and there is no reason to
  // ask that question dozens of times.
  const primed = React.useRef(false);

  const prime = React.useCallback(() => {
    if (primed.current || typeof href !== 'string') return;
    primed.current = true;
    router.prefetch(href);
  }, [href, router]);

  return (
    <Link
      href={href}
      // `false` disables both viewport and hover prefetching; the hover half is
      // reinstated below. `undefined` leaves Next's default in place, which is
      // what a coarse pointer wants.
      prefetch={finePointer ? false : undefined}
      onPointerEnter={finePointer ? prime : undefined}
      onFocus={prime}
      {...props}
    >
      {children}
    </Link>
  );
}
