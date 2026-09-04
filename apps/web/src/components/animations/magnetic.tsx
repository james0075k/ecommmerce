'use client';

import * as React from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

import { useFinePointer } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';

/**
 * Pulls its child a little way towards the cursor while hovered, and springs
 * back on leave.
 *
 * Desktop only, and deliberately so: on a touch screen there is no cursor to
 * lean towards, and the `pointer: fine` guard also rules out the stylus and
 * hybrid cases where the effect would fire on a tap.
 */
export function Magnetic({
  children,
  className,
  /** Fraction of the distance from centre to cursor the element travels. */
  strength = 0.28,
  /** Never travel further than this many pixels on either axis. */
  max = 14,
}: {
  children: React.ReactNode;
  className?: string;
  strength?: number;
  max?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 260, damping: 24, mass: 0.4 });
  const y = useSpring(rawY, { stiffness: 260, damping: 24, mass: 0.4 });

  const finePointer = useFinePointer();
  const enabled = finePointer && !reduced;

  const handleMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const node = ref.current;
    if (!node || !enabled) return;

    const rect = node.getBoundingClientRect();
    const offsetX = event.clientX - (rect.left + rect.width / 2);
    const offsetY = event.clientY - (rect.top + rect.height / 2);

    rawX.set(clamp(offsetX * strength, max));
    rawY.set(clamp(offsetY * strength, max));
  };

  const reset = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.span
      ref={ref}
      className={cn('inline-flex', className)}
      style={enabled ? { x, y } : undefined}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      // A keyboard user never fires pointermove, so the offset would otherwise
      // survive a click-then-tab.
      onBlur={reset}
    >
      {children}
    </motion.span>
  );
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
