'use client';

import * as React from 'react';
import { animate, useReducedMotion } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  /** Renders the tweened value. Defaults to a rounded integer. */
  format?: (value: number) => string;
  durationSeconds?: number;
  className?: string;
}

/**
 * A number that counts up to its value on mount and on every change.
 *
 * Driven by framer-motion's imperative `animate` writing to a ref rather than
 * to React state. A tween that calls `setState` sixty times a second re-renders
 * the whole card sixty times a second, and on the dashboard that is nine cards
 * plus a chart; writing `textContent` directly keeps the animation off the
 * render path entirely.
 *
 * `prefers-reduced-motion` skips the tween and shows the final value. A
 * counting number is decoration - the figure is the point - so there is nothing
 * to degrade to.
 */
export function AnimatedNumber({
  value,
  format = defaultFormat,
  durationSeconds = 0.9,
  className,
}: AnimatedNumberProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const previous = React.useRef(0);

  // An effect event so a caller passing an inline `format` arrow does not
  // restart the tween on every render.
  const render = React.useEffectEvent((current: number) => {
    if (ref.current) ref.current.textContent = format(current);
  });

  React.useEffect(() => {
    const from = previous.current;
    previous.current = value;

    if (reduceMotion) {
      render(value);
      return;
    }

    const controls = animate(from, value, {
      duration: durationSeconds,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: render,
    });

    return () => controls.stop();
  }, [value, durationSeconds, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {/* The final value is the server-rendered content, so a page with no
          JavaScript - or one being read by a screen reader before hydration -
          shows the real figure rather than a zero. */}
      {format(value)}
    </span>
  );
}

function defaultFormat(value: number): string {
  return Math.round(value).toLocaleString('en-NP');
}
