'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { FadeInOnScroll } from '@/components/animations/fade-in-on-scroll';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * One heading shape for every homepage section, so the page reads as a single
 * document rather than eight separately designed blocks.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = 'start',
  className,
}: {
  eyebrow: string;
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
      <div className={cn('space-y-2', align === 'center' && 'max-w-2xl')}>
        <span className="font-mono text-xs tracking-widest text-primary uppercase">
          {eyebrow}
        </span>
        <h2 className="font-display text-2xl font-bold tracking-tight text-balance md:text-3xl lg:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground text-pretty md:text-base">
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        <Button asChild variant="ghost" size="sm" className="group/link self-start md:self-auto">
          <Link href={action.href}>
            {action.label}
            <ArrowRight className="size-4 transition-transform duration-200 group-hover/link:translate-x-0.5" />
          </Link>
        </Button>
      ) : null}
    </FadeInOnScroll>
  );
}
