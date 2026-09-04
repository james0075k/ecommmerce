'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import type { CategoryNode } from '@/lib/catalog';
import { cn } from '@/lib/utils';

/**
 * The desktop categories dropdown: a full-width panel of every department with
 * its sub-categories beneath it.
 *
 * Opens on hover and on click, because those are two different intents - a
 * pointer sweeping across the navbar should reveal it, a click should pin it
 * open. Escape and blur close it, and the whole thing is hidden below `lg`
 * where the mobile menu takes over.
 */
export function MegaMenu({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);

  const { data } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryNode[]>('/categories'),
    staleTime: 5 * 60_000,
  });

  const categories = (data ?? []).filter((category) => category.productCount > 0).slice(0, 8);

  // A small grace period on leave, so crossing the gap between the trigger and
  // the panel does not close it.
  const scheduleClose = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  React.useEffect(() => () => cancelClose(), []);

  return (
    <div
      className="hidden lg:block"
      onPointerEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={scheduleClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'bz-label inline-flex cursor-pointer items-center gap-1.5 py-2 transition-colors duration-[260ms]',
          overlay
            ? 'text-white/85 hover:text-white'
            : 'text-muted-foreground hover:text-foreground',
          open && (overlay ? 'text-white' : 'text-foreground'),
        )}
      >
        {/* The underline sits on the word rather than the whole control, so
            the chevron is not underlined along with it. */}
        <span className={cn('bz-underline', open && 'bg-[length:100%_1px]')}>Shop</span>
        <ChevronDown
          className={cn(
            'size-3 transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && categories.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            // Anchored to the header rather than the trigger, so the panel
            // spans the viewport the way the navbar does.
            // Opaque, not translucent: the panel is nested inside the header's
            // own backdrop-filter, and a second one does not composite over the
            // first - the page behind showed through unblurred.
            className="absolute inset-x-0 top-full border-b border-border bg-background shadow-float"
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
          >
            <div className="container-bazaar grid gap-x-8 gap-y-6 py-8 text-foreground md:grid-cols-3 lg:grid-cols-4">
              {categories.map((category) => (
                <div key={category.id} className="min-w-0">
                  <Link
                    href={`/products?category=${category.slug}`}
                    onClick={() => setOpen(false)}
                    className="group/head flex items-baseline justify-between gap-2"
                  >
                    <span className="font-display truncate text-sm font-bold tracking-tight group-hover/head:text-primary">
                      {category.name}
                    </span>
                    <span className="numeric shrink-0 text-xs text-muted-foreground">
                      {category.productCount}
                    </span>
                  </Link>

                  {category.children.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {category.children.slice(0, 5).map((child) => (
                        <li key={child.id}>
                          <Link
                            href={`/products?category=${child.slug}`}
                            onClick={() => setOpen(false)}
                            className="block truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}

              <div className="min-w-0 md:col-span-3 lg:col-span-1">
                <Link
                  href="/products"
                  onClick={() => setOpen(false)}
                  className="group/all flex h-full min-h-28 flex-col justify-between rounded-lg border border-border bg-accent/60 p-4 transition-colors hover:border-primary"
                >
                  <span className="font-display text-sm font-bold tracking-tight">
                    Everything, unfiltered
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    Browse the whole catalogue
                    <ArrowRight className="size-3.5 transition-transform duration-200 group-hover/all:translate-x-0.5" />
                  </span>
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
