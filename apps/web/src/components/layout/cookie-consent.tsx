'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Cookie } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { clearConsent, writeConsent } from '@/lib/consent';
import { useConsent } from '@/lib/hooks/use-consent';

/**
 * The cookie banner (Phase 12.10).
 *
 * Three deliberate choices, because most cookie banners get all three wrong:
 *
 *  1. **Accept and decline are the same size.** A prominent "Accept all" beside
 *     a grey "Manage preferences" is a dark pattern, and under the GDPR it is
 *     not consent at all. If declining is harder than accepting, the answer is
 *     not freely given.
 *  2. **It does not block the page.** No overlay, no scroll lock. A shopper who
 *     ignores it can shop; nothing loads until they choose, so ignoring it is
 *     the same as declining until they say otherwise.
 *  3. **It renders nothing until storage has been read.** `useConsent` reports
 *     `'unknown'` through hydration, which is what keeps the banner from
 *     flashing at everyone who already answered.
 *
 * It also only ever appears when there is something to consent to: without
 * NEXT_PUBLIC_POSTHOG_KEY nothing third-party can load, and a banner asking
 * permission for tracking that does not exist is theatre.
 */
export function CookieConsent() {
  const consent = useConsent();

  // `'unknown'` is "not read yet"; `null` is "read, and never answered" - the
  // one case that shows the banner.
  const open = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY) && consent === null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          // `region` rather than `dialog`: it is not modal, and announcing it as
          // a dialog would tell a screen reader the rest of the page is inert
          // when it is not.
          role="region"
          aria-label="Cookie preferences"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          // z-50 sits above the page and above the fixed bottom navigation
          // (z-40), and below the toast layer. The bottom offset clears that
          // navigation on small screens - it is `lg:hidden`, so the desktop
          // offset goes back to a normal margin.
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 mx-auto max-w-3xl rounded-xl border border-border bg-card/95 p-4 shadow-float backdrop-blur-md sm:inset-x-6 sm:p-5 lg:bottom-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Cookie className="size-6 shrink-0 text-primary" aria-hidden />

            <div className="flex-1 space-y-1">
              <h2 className="font-display text-sm font-semibold tracking-tight">
                Analytics cookies
              </h2>
              <p className="text-sm text-muted-foreground text-pretty">
                We would like to measure how the store is used, so we can fix what is
                slow and confusing. Everything needed to sign in, hold your cart and
                take a payment works either way.{' '}
                <Link
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Privacy policy
                </Link>
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => writeConsent('denied')}
              >
                Decline
              </Button>
              <Button
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => writeConsent('granted')}
              >
                Accept
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Footer control that reopens the banner. Consent has to be as easy to withdraw
 * as it was to give, and there is otherwise no way back to the choice.
 */
export function CookiePreferencesLink({ className }: { className?: string }) {
  const consent = useConsent();

  // Nothing to revisit before a decision exists, and nothing to revisit at all
  // when analytics is not configured.
  const available =
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY) &&
    consent !== 'unknown' &&
    consent !== null;

  if (!available) return null;

  return (
    <button type="button" className={className} onClick={() => clearConsent()}>
      Cookie preferences
    </button>
  );
}
