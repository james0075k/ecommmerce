'use client';

import * as React from 'react';
import { motion } from 'framer-motion';

import { fadeInUp, revealViewport, scaleIn, staggerChildren } from '@bazaar/ui';

/**
 * Scroll-reveal wrappers built on the H2 motion presets.
 * `Reveal` fades a block in; `RevealList` staggers its children 50ms apart.
 */

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

export function RevealList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={staggerChildren(0.05)}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={scaleIn}>
      {children}
    </motion.div>
  );
}
