'use client';

import * as React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * Moves its children slower than the page scrolls, so a background drifts
 * behind the content in front of it.
 *
 * `useScroll` with an element target reads the progress of *this* section
 * through the viewport rather than the whole document, which keeps the effect
 * local - a section halfway down the page starts its travel when it appears,
 * not with an offset baked in from everything above it.
 */
export function ParallaxSection({
  children,
  className,
  /** 0.3-0.5 reads as depth; above ~0.6 it reads as a bug. */
  speed = 0.35,
  /** Extra scale so the slower layer never exposes an edge. */
  overscan = true,
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
  overscan?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  // Travel is expressed in viewport heights so it scales with the screen.
  const distance = speed * 50;
  const y = useTransform(scrollYProgress, [0, 1], [`${-distance}%`, `${distance}%`]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <motion.div
        className="h-full w-full will-change-transform"
        style={reduced ? undefined : { y, scale: overscan ? 1 + speed * 0.6 : 1 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
