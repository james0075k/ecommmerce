'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { pageTransition } from '@bazaar/ui';

/**
 * Route-change transition: fade in and slide up 12px, fade out 8px (H2).
 *
 * Wraps `<main>` rather than the whole shell, so the header, the cart drawer
 * and the toaster never animate out from under the shopper.
 *
 * The wrapper only holds a transform while it is moving - Framer writes
 * `transform: none` once every value is back at its default - which matters
 * because a lingering transform would become the containing block for the
 * `position: fixed` action bars some routes render.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  // Honouring the OS setting here rather than inside the variants keeps the
  // extra element out of the tree entirely for anyone who asked for less motion.
  if (reduced) return <>{children}</>;

  return (
    // `initial={false}` skips the transition on first paint - the page has
    // already been server-rendered, so animating it in would only delay it.
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={pageTransition}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
