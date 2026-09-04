'use client';

import Link from 'next/link';

import { FadeInOnScroll } from '@/components/animations/fade-in-on-scroll';
import { cn } from '@/lib/utils';

/**
 * One heading shape for every homepage section, so the page reads as a single
 * document rather than eight separately designed blocks.
 *
 * Deliberately no eyebrow. A tracked-out uppercase word sitting above every
 * heading is a label for the heading, and a heading that needs labelling is
 * not doing its job - "Trending" over "What everyone is buying this week" says
 * the same thing twice, in two type styles, and costs a line of vertical space
 * on every section of the page.
 */
export function SectionHeading({
  title,
  description,
  action,
  align = 'start',
  className,
}: {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  align?: 'start' | 'center';
  className?: string;
}) {
  return (
    <FadeInOnScroll
      className={cn(
        'mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between',
        align === 'center' && 'md:flex-col md:items-center md:text-center',
        className,
      )}
    >
      <div className={cn('space-y-3', align === 'center' && 'max-w-2xl')}>
        <h2 className="text-[1.75rem] md:text-4xl lg:text-[2.75rem]">{title}</h2>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground text-pretty md:text-base">
            {description}
          </p>
        ) : null}
      </div>

      {/* A link, not a button. The section already has a heading with weight
          behind it; a second filled control beside it would compete with the
          products underneath, which are the actual call to action. */}
      {action ? (
        <Link
          href={action.href}
          className="bz-label bz-underline self-start whitespace-nowrap text-muted-foreground transition-colors duration-[260ms] hover:text-foreground md:self-auto"
        >
          {action.label}
        </Link>
      ) : null}
    </FadeInOnScroll>
  );
}
