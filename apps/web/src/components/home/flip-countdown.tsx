'use client';

import * as React from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * The flash-sale clock, built as a split-flap board.
 *
 * Each digit is four layers: the top and bottom halves of the card showing the
 * settled state, plus two flaps that hinge over them - the old digit's top half
 * falling away, then the new digit's bottom half swinging up behind it. That
 * ordering is the whole trick; a single rotating card reads as a card turning
 * over rather than a board flipping.
 */

/**
 * The card size is two CSS variables rather than two numbers, so the board can
 * shrink at narrow widths without the component measuring anything. Six digits
 * at the desktop size overflow a 390px phone, and a countdown with the seconds
 * cut off is worse than a smaller one.
 */
const SCALE =
  '[--flip-h:3.25rem] [--flip-w:2.25rem] text-2xl md:[--flip-h:4.5rem] md:[--flip-w:3.25rem] md:text-4xl';

/** Counts down to the next local midnight, then rolls over to the next one. */
export function FlipCountdown({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Six digits re-animating every second is real work; off screen it is work
  // for nobody. `once: false` so the clock resumes when it comes back.
  const inView = useInView(ref, { once: false });
  const [remaining, setRemaining] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!inView) return;

    // Polling faster than the display changes keeps the digits flipping on the
    // second boundary rather than drifting from whenever the component mounted
    // - but the state is only replaced when the displayed second actually
    // changes, so the extra polls cost nothing in renders.
    const tick = () =>
      setRemaining((previous) => {
        const next = msUntilMidnight();
        const sameSecond =
          previous !== null && Math.floor(previous / 1000) === Math.floor(next / 1000);
        return sameSecond ? previous : next;
      });

    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [inView]);

  // Server render and first paint show a settled zero board rather than a
  // client-only time, which would not survive hydration.
  const total = Math.max(0, Math.floor((remaining ?? 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const label =
    remaining === null
      ? 'Time remaining is loading'
      : `${hours} hours, ${minutes} minutes and ${seconds} seconds left`;

  return (
    <div ref={ref} className={cn('flex items-start gap-1.5 md:gap-3', SCALE, className)}>
      <span className="sr-only" aria-live="off">
        {label}
      </span>

      <FlipGroup value={hours} unit="hours" />
      <Separator />
      <FlipGroup value={minutes} unit="minutes" />
      <Separator />
      <FlipGroup value={seconds} unit="seconds" />
    </div>
  );
}

function FlipGroup({ value, unit }: { value: number; unit: string }) {
  const [tens, ones] = String(Math.min(99, value)).padStart(2, '0');

  return (
    <div className="flex flex-col items-center gap-1.5" aria-hidden>
      <div className="flex gap-1">
        <FlipDigit digit={tens} />
        <FlipDigit digit={ones} />
      </div>
      <span className="bz-label text-muted-foreground">
        {unit}
      </span>
    </div>
  );
}

function Separator() {
  return (
    <span
      aria-hidden
      className="flex h-[var(--flip-h)] items-center font-semibold text-muted-foreground"
    >
      :
    </span>
  );
}

function FlipDigit({ digit }: { digit: string }) {
  const reduced = useReducedMotion();

  // Adjusting state during render is the supported way to derive "what did this
  // show a moment ago" without an effect - React re-runs this component before
  // committing anything, so no extra paint happens.
  const [state, setState] = React.useState({ current: digit, previous: digit });
  if (state.current !== digit) {
    setState({ current: digit, previous: state.current });
  }

  const glyph =
    'numeric absolute inset-x-0 flex h-[var(--flip-h)] items-center justify-center font-semibold text-foreground';
  const card =
    'absolute inset-x-0 h-1/2 overflow-hidden bg-card [backface-visibility:hidden]';

  if (reduced) {
    return (
      <span className="numeric grid h-[var(--flip-h)] w-[var(--flip-w)] place-items-center rounded-md border border-border bg-card font-semibold">
        {digit}
      </span>
    );
  }

  return (
    <span
      className="relative block h-[var(--flip-h)] w-[var(--flip-w)] rounded-md border border-border bg-card shadow-card"
      style={{ perspective: '620px' }}
    >
      {/* Settled halves: the new digit above, the old one still below. */}
      <span className={cn(card, 'top-0 rounded-t-md border-b border-border/60')}>
        <span className={cn(glyph, 'top-0')}>{state.current}</span>
      </span>
      <span className={cn(card, 'bottom-0 rounded-b-md')}>
        <span className={cn(glyph, 'bottom-0')}>{state.previous}</span>
      </span>

      {/* The flaps. Keyed on the digit so a new pair mounts on every change. */}
      <motion.span
        key={`top-${state.current}`}
        className={cn(card, 'top-0 origin-bottom rounded-t-md border-b border-border/60')}
        initial={{ rotateX: 0 }}
        animate={{ rotateX: -90 }}
        transition={{ duration: 0.22, ease: 'easeIn' }}
      >
        <span className={cn(glyph, 'top-0')}>{state.previous}</span>
      </motion.span>

      <motion.span
        key={`bottom-${state.current}`}
        className={cn(card, 'bottom-0 origin-top rounded-b-md')}
        initial={{ rotateX: 90 }}
        animate={{ rotateX: 0 }}
        transition={{ duration: 0.28, delay: 0.22, ease: 'easeOut' }}
      >
        <span className={cn(glyph, 'bottom-0')}>{state.current}</span>
      </motion.span>
    </span>
  );
}

/**
 * Milliseconds until the next local midnight.
 *
 * Built by rolling the date forward rather than adding 24 hours, so the two
 * days a year that are not 24 hours long still land on midnight.
 */
function msUntilMidnight(now = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}
