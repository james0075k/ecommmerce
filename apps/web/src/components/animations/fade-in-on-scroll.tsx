'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { revealViewport } from '@bazaar/ui';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

const OFFSET: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 24 },
  down: { x: 0, y: -24 },
  left: { x: 24, y: 0 },
  right: { x: -24, y: 0 },
  none: { x: 0, y: 0 },
};

/**
 * Fades a block in the first time it scrolls into view.
 *
 * Framer's `whileInView` is an Intersection Observer underneath, so this costs
 * no scroll listener - the element is simply told when it crosses the 20%
 * threshold in `revealViewport`.
 *
 * This replaces the Phase 1 `Reveal` wrapper, which had the direction, distance
 * and delay baked in - the homepage needs all three to differ per section.
 */
export function FadeInOnScroll({
  children,
  className,
  delay = 0,
  duration = 0.6,
  direction = 'up',
  amount,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  direction?: Direction;
  /** How much of the element must be visible before it fires. */
  amount?: number;
}) {
  const reduced = useReducedMotion();
  const offset = reduced ? OFFSET.none : OFFSET[direction];

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={amount === undefined ? revealViewport : { once: true, amount }}
      transition={{
        duration: reduced ? 0 : duration,
        delay: reduced ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
