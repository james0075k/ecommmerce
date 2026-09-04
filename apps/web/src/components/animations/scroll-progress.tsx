'use client';

import { motion, useScroll, useSpring } from 'framer-motion';

/**
 * The hairline at the very top of the window that fills as the page scrolls.
 *
 * `scaleX` is driven by a motion value, so the bar is repainted on the
 * compositor and the scroll handler never touches React. The spring is what
 * stops it looking mechanical on a trackpad flick.
 *
 * No reduced-motion guard: this is an indicator of position, not an animation
 * for its own sake, and removing it would remove information.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 34,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-100 h-0.5 origin-left bg-gradient-to-r from-primary via-sale to-primary"
    />
  );
}
