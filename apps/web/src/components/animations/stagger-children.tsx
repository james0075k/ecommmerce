'use client';

import * as React from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

import { revealViewport } from '@bazaar/ui';

/**
 * Staggered entry for a list. The parent owns the timing, each child only
 * declares what "hidden" and "visible" look like, which is what lets a grid of
 * twelve cards animate in sequence without twelve delays hard-coded into it.
 *
 * Blueprint H2 puts product cards at 100ms apart; other lists use 50ms.
 */
export function StaggerChildren({
  children,
  className,
  stagger = 0.1,
  delay = 0.05,
  amount,
}: {
  children: React.ReactNode;
  className?: string;
  /** Seconds between each child. */
  stagger?: number;
  /** Seconds before the first child. */
  delay?: number;
  amount?: number;
}) {
  const reduced = useReducedMotion();

  const variants: Variants = {
    hidden: {},
    visible: {
      transition: reduced
        ? {}
        : { staggerChildren: stagger, delayChildren: delay },
    },
  };

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={amount === undefined ? revealViewport : { once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

/** The default child variant: fade up 24px over 500ms. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export function StaggerItem({
  children,
  className,
  variants = staggerItem,
}: {
  children: React.ReactNode;
  className?: string;
  variants?: Variants;
}) {
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}
