'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Headline that assembles itself letter by letter.
 *
 * Each glyph is its own span, which is exactly the thing that breaks a screen
 * reader - so the real text is rendered once in a visually hidden element and
 * the animated copy is `aria-hidden`. Words stay wrapped in their own
 * `inline-block` so a line break never lands mid-word.
 *
 * The stagger is an inline `animation-delay` on a CSS keyframe rather than a
 * Framer Motion variant. A headline is thirty-odd letters, and thirty motion
 * components is thirty more things for React to hydrate on the critical path -
 * measurably so on a throttled phone - for an effect that needs no
 * orchestration, no scroll awareness and no interruption.
 *
 * Remounting restarts it: the caller passes a `key` when the text changes.
 */
export function KineticText({
  text,
  className,
  delay = 0,
  stagger = 0.028,
  as: Tag = 'span',
}: {
  text: string;
  className?: string;
  /** Seconds before the first letter moves. */
  delay?: number;
  /** Seconds between letters. */
  stagger?: number;
  as?: 'span' | 'h1' | 'h2' | 'p';
}) {
  const words = React.useMemo(() => text.split(' '), [text]);

  let index = 0;

  return (
    <Tag className={cn('relative', className)}>
      <span className="sr-only">{text}</span>

      <span
        aria-hidden
        // The perspective is what turns the y-offset into a flip rather than a
        // slide; without it the rotateX in the keyframe is invisible.
        className="inline-block [perspective:600px]"
      >
        {words.map((word, wordIndex) => (
          <span key={`${word}-${wordIndex}`} className="inline-block whitespace-nowrap">
            {[...word].map((char, charIndex) => {
              const at = delay + index * stagger;
              index += 1;
              return (
                <span
                  key={`${char}-${charIndex}`}
                  className="bz-letter"
                  style={{ animationDelay: `${at.toFixed(3)}s` }}
                >
                  {char}
                </span>
              );
            })}
            {wordIndex < words.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
          </span>
        ))}
      </span>
    </Tag>
  );
}
