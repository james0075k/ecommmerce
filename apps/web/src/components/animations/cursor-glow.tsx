'use client';

import * as React from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

import { useFinePointer } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';

/**
 * A soft radial highlight that follows the cursor inside its own section.
 *
 * Scoped rather than global: a glow that tracks across the whole document is
 * decoration, one that only lights the premium sections is emphasis. Pointer
 * position is written to motion values, so tracking never re-renders React.
 *
 * Desktop pointers only, and the layer is `pointer-events-none` so it cannot
 * swallow a click on whatever it is sitting over.
 */
export function CursorGlow({
  className,
  size = 420,
  /** Any CSS colour; defaults to a wash of the brand purple. */
  color = 'color-mix(in srgb, var(--bz-primary) 22%, transparent)',
}: {
  className?: string;
  size?: number;
  color?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const finePointer = useFinePointer();
  const enabled = finePointer && !reduced;
  const [visible, setVisible] = React.useState(false);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 180, damping: 26, mass: 0.6 });
  const y = useSpring(rawY, { stiffness: 180, damping: 26, mass: 0.6 });

  const background = useMotionTemplate`radial-gradient(${size}px circle at ${x}px ${y}px, ${color}, transparent 70%)`;

  React.useEffect(() => {
    if (!enabled) return;

    // Listening on the parent rather than the glow layer itself, because the
    // layer does not receive pointer events at all.
    const parent = ref.current?.parentElement;
    if (!parent) return;

    const onMove = (event: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      rawX.set(event.clientX - rect.left);
      rawY.set(event.clientY - rect.top);
      setVisible(true);
    };
    const onLeave = () => setVisible(false);

    parent.addEventListener('pointermove', onMove);
    parent.addEventListener('pointerleave', onLeave);
    return () => {
      parent.removeEventListener('pointermove', onMove);
      parent.removeEventListener('pointerleave', onLeave);
    };
  }, [enabled, rawX, rawY]);

  return (
    <motion.div
      ref={ref}
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 z-0 transition-opacity duration-500',
        className,
      )}
      style={enabled ? { background, opacity: visible ? 1 : 0 } : { opacity: 0 }}
    />
  );
}
