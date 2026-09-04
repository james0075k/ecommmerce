import Link from 'next/link';
import { Facebook, Instagram, Linkedin, Twitter, Youtube } from 'lucide-react';

import { NEPAL_DISTRICTS } from '@bazaar/shared/constants';

import { CookiePreferencesLink } from '@/components/layout/cookie-consent';
import { NewsletterForm } from '@/components/layout/newsletter-form';
import { Wordmark } from '@/components/layout/wordmark';
import { cn } from '@/lib/utils';

const NAVIGATE = [
  { label: 'All products', href: '/products' },
  { label: 'New arrivals', href: '/products?sort=newest' },
  { label: 'Categories', href: '/categories' },
  { label: 'Your orders', href: '/orders' },
  { label: 'Wishlist', href: '/wishlist' },
];

const SOCIAL = [
  { label: 'Instagram', Icon: Instagram, href: 'https://instagram.com' },
  { label: 'Facebook', Icon: Facebook, href: 'https://facebook.com' },
  { label: 'YouTube', Icon: Youtube, href: 'https://youtube.com' },
  { label: 'X', Icon: Twitter, href: 'https://x.com' },
  { label: 'LinkedIn', Icon: Linkedin, href: 'https://linkedin.com' },
];

const OFFICIAL = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Returns and refunds', href: '/refunds' },
  { label: 'Payment methods', href: '/checkout' },
];

/**
 * The payment rail. Wordmarks rather than logo images - the store has no
 * licensed logo assets, and a mis-drawn logo is worse than a clean wordmark.
 *
 * Monochrome at rest so eight saturated chips do not turn the quietest part of
 * the page into an advert, and each takes its own brand colour under the
 * cursor. The dark-mode values are lifted: the real brand reds land between
 * 2.9:1 and 3.9:1 on the dark surface, which is under AA for 12px text.
 */
const PAYMENTS = [
  { label: 'eSewa', className: 'hover:text-[#60BB46]' },
  { label: 'Khalti', className: 'hover:text-[#5C2D91] dark:hover:text-[#A78BFA]' },
  { label: 'ConnectIPS', className: 'hover:text-[#E31E24] dark:hover:text-[#FF9098]' },
  { label: 'IME Pay', className: 'hover:text-[#C8102E] dark:hover:text-[#FF8FA0]' },
  { label: 'Fonepay', className: 'hover:text-[#EE1C25] dark:hover:text-[#FF9298]' },
  { label: 'Visa', className: 'hover:text-[#1A1F71] dark:hover:text-[#8AA1FF]' },
  { label: 'Mastercard', className: 'hover:text-[#EB001B] dark:hover:text-[#FF9095]' },
  { label: 'Cash on delivery', className: 'hover:text-ok' },
];

/** The storefront footer, mounted once by the (shop) layout. */
export function SiteFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    // `className` is how the shop shell reserves the height of the fixed bottom
    // navigation, so the last footer row is never trapped underneath it.
    <footer className={cn('bz-defer-paint mt-auto', className)}>
      {/* --- Wordmark band ------------------------------------------------
          The brand at the size of a building, cropped by the bottom of its own
          panel. Cropping is the point: a logotype that runs off the edge reads
          as architecture rather than as a signature, and it gives the end of
          the page a full stop that no amount of small print can.

          `aria-hidden` because the name is already the first link in the bar
          above and the first thing in the copyright line below; a screen reader
          does not need it a third time. */}
      <div aria-hidden className="bz-panel mb-px bg-card">
        {/* The crop is em-relative rather than a fixed height, so the same
            fraction of the letterforms is cut off at every viewport width: the
            negative bottom margin pulls the baseline past the panel edge and
            the panel clips it. */}
        <Wordmark className="bz-display bz-wordmark-crop px-6 text-center text-[clamp(5rem,24vw,24rem)] text-wordmark" />
      </div>

      {/* --- Columns ------------------------------------------------------- */}
      <div className="bz-panel bg-card">
        <div className="grid gap-x-8 gap-y-12 px-6 py-14 md:grid-cols-2 md:px-10 lg:grid-cols-12 lg:py-16">
          {/* Sign-up. Wider than the link columns and separated by a rule
              rather than by a gap: it is a different kind of thing, not a
              fifth list. */}
          <div className="space-y-5 lg:col-span-4 lg:border-r lg:border-border lg:pr-12">
            <h2 className="max-w-sm text-2xl md:text-[1.75rem]">
              Get to the good stuff first.
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              New arrivals, price drops on things you have looked at, and the flash sale
              start time. One email a week at most.
            </p>

            <NewsletterForm idPrefix="footer-newsletter" />

            <p className="text-xs text-muted-foreground">
              By subscribing you agree to our{' '}
              <Link href="/privacy" className="bz-underline text-foreground">
                privacy policy
              </Link>
              . Unsubscribing takes one click.
            </p>
          </div>

          <nav aria-labelledby="footer-navigate" className="lg:col-span-2">
            <h2 id="footer-navigate" className="bz-label text-muted-foreground">
              Navigate
            </h2>
            <ul className="mt-5 space-y-3">
              {NAVIGATE.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="bz-underline text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-social" className="lg:col-span-2">
            <h2 id="footer-social" className="bz-label text-muted-foreground">
              Social
            </h2>
            <ul className="mt-5 space-y-3">
              {SOCIAL.map(({ label, Icon, href }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group/social inline-flex items-center gap-2.5 text-sm"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="bz-underline group-hover/social:bg-[length:100%_1px]">
                      {label}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-official" className="lg:col-span-2">
            <h2 id="footer-official" className="bz-label text-muted-foreground">
              Official
            </h2>
            <ul className="mt-5 space-y-3">
              {OFFICIAL.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="bz-underline text-sm">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                {/* Consent that cannot be withdrawn as easily as it was given
                    is not consent, so the control lives on every page. */}
                <CookiePreferencesLink className="bz-underline cursor-pointer text-sm" />
              </li>
            </ul>
          </nav>

          <div className="lg:col-span-2">
            <h2 className="bz-label text-muted-foreground">Support</h2>
            <div className="mt-5 space-y-4 text-sm text-muted-foreground">
              <p>We are here Sunday to Friday, 10am to 6pm NPT.</p>
              <p>
                <a href="mailto:hello@bazaar.com.np" className="bz-underline text-foreground">
                  hello@bazaar.com.np
                </a>
              </p>

              <ul className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1 text-xs">
                {PAYMENTS.map((payment) => (
                  <li
                    key={payment.label}
                    className={cn(
                      'cursor-default transition-colors duration-[260ms]',
                      payment.className,
                    )}
                  >
                    {payment.label}
                  </li>
                ))}
              </ul>

              <p className="numeric pt-1 text-xs">© {year} Bazaar</p>
            </div>
          </div>
        </div>
      </div>

      {/* --- Reach --------------------------------------------------------
          Where the reference site puts a country switcher. Bazaar delivers to
          one country, so a selector would be a control with nothing to choose;
          the same row carries the fact instead. */}
      <div className="px-[var(--bz-inset)] pt-px pb-[var(--bz-inset)]">
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] bg-card py-5 text-center text-xs text-muted-foreground">
          <span className="bz-label">Delivering to</span>
          <span>
            all <span className="numeric">{NEPAL_DISTRICTS.length}</span> districts of Nepal
          </span>
          <span aria-hidden className="text-border">
            |
          </span>
          <span>Prices in Nepalese rupees, inclusive of VAT</span>
        </p>
      </div>
    </footer>
  );
}
