'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Heart, LogOut, Package, User, X } from 'lucide-react';

import { EASE_DRAWER } from '@bazaar/ui';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import type { CategoryNode } from '@/lib/catalog';
import { useAuthStore } from '@/lib/store/auth-store';

const QUICK_LINKS = [
  { href: '/products', label: 'All products' },
  { href: '/products?sort=newest', label: 'New in' },
  { href: '/products?sort=popular', label: 'Most popular' },
  { href: '/products?inStock=true', label: 'In stock now' },
];

/**
 * The mobile navigation: a full-screen panel that slides in from the right,
 * with every department as an accordion row.
 *
 * Full-screen rather than a partial drawer because the category tree is the
 * main thing here, and half a screen of it means scrolling a list inside a
 * sheet inside a page.
 */
export function MobileMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const user = useAuthStore((state) => state.user);

  const { data } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryNode[]>('/categories'),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const categories = (data ?? []).filter((category) => category.productCount > 0);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-90 flex flex-col bg-background lg:hidden"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.32, ease: EASE_DRAWER }}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <Link
              href="/"
              onClick={onClose}
              className="font-display text-lg font-extrabold tracking-tight"
            >
              Bazaar
            </Link>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
              <X className="size-5" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
            <motion.nav
              aria-label="Quick links"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}
              className="grid grid-cols-2 gap-2"
            >
              {QUICK_LINKS.map((link) => (
                <motion.div
                  key={link.label}
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    visible: { opacity: 1, y: 0 },
                  }}
                >
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className="flex h-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-3 text-sm font-medium transition-colors active:bg-muted"
                  >
                    {link.label}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </motion.div>
              ))}
            </motion.nav>

            <h2 className="mt-7 mb-2 font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Departments
            </h2>

            {categories.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Categories are loading.
              </p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {categories.map((category) => (
                  <AccordionItem key={category.id} value={category.slug}>
                    {category.children.length > 0 ? (
                      <>
                        <AccordionTrigger className="text-sm font-medium">
                          <span className="flex flex-1 items-center justify-between gap-2 pr-2">
                            {category.name}
                            <span className="numeric text-xs text-muted-foreground">
                              {category.productCount}
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="space-y-1 pb-1">
                            <li>
                              <Link
                                href={`/products?category=${category.slug}`}
                                onClick={onClose}
                                className="block rounded-sm px-2 py-2 text-sm font-medium text-primary"
                              >
                                All {category.name}
                              </Link>
                            </li>
                            {category.children.map((child) => (
                              <li key={child.id}>
                                <Link
                                  href={`/products?category=${child.slug}`}
                                  onClick={onClose}
                                  className="block rounded-sm px-2 py-2 text-sm text-muted-foreground active:bg-muted"
                                >
                                  {child.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </>
                    ) : (
                      // A department with nothing beneath it is a link, not a
                      // disclosure that opens onto an empty panel.
                      <Link
                        href={`/products?category=${category.slug}`}
                        onClick={onClose}
                        className="flex items-center justify-between gap-2 border-b border-border py-4 text-sm font-medium"
                      >
                        {category.name}
                        <span className="numeric text-xs text-muted-foreground">
                          {category.productCount}
                        </span>
                      </Link>
                    )}
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>

          <div className="shrink-0 border-t border-border p-4">
            {user ? (
              <div className="grid grid-cols-3 gap-2">
                <MenuAction href="/account" onClose={onClose} icon={User} label="Account" />
                <MenuAction href="/orders" onClose={onClose} icon={Package} label="Orders" />
                <MenuAction href="/wishlist" onClose={onClose} icon={Heart} label="Wishlist" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button asChild size="lg" className="h-11">
                  <Link href="/login" onClick={onClose}>
                    Log in
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11">
                  <Link href="/register" onClick={onClose}>
                    Create account
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MenuAction({
  href,
  onClose,
  icon: Icon,
  label,
}: {
  href: string;
  onClose: () => void;
  icon: typeof LogOut;
  label: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex flex-col items-center gap-1.5 rounded-md border border-border py-3 text-xs font-medium transition-colors active:bg-muted"
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
