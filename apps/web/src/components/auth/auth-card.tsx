'use client';

import * as React from 'react';
import { motion } from 'framer-motion';

import { fadeInUp } from '@bazaar/ui';
import { cn } from '@/lib/utils';

/**
 * Shared frame for the auth screens: fades up on mount using the H2 page-load
 * timing (400ms, cubic-bezier(0.22, 1, 0.36, 1)).
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" className={cn(className)}>
      <div className="rounded-lg border border-border bg-card p-6 shadow-card sm:p-8">
        <div className="mb-6 space-y-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground text-pretty">{description}</p>
          ) : null}
        </div>
        {children}
      </div>
      {footer ? <div className="mt-5 text-center text-sm">{footer}</div> : null}
    </motion.div>
  );
}

/** "or" rule between the password form and the alternative sign-in methods. */
export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Inline error banner for failures that are not tied to one field. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
