import Link from 'next/link';
import { Facebook, Instagram, Linkedin, Twitter, Youtube } from 'lucide-react';

import { NEPAL_DISTRICTS } from '@bazaar/shared/constants';

import { cn } from '@/lib/utils';

const COLUMNS = [
  {
    heading: 'Shop',
    links: [
      { label: 'All products', href: '/products' },
      { label: 'New arrivals', href: '/products?sort=newest' },
      { label: 'Most popular', href: '/products?sort=popular' },
      { label: 'Top rated', href: '/products?sort=rating' },
      { label: 'In stock now', href: '/products?inStock=true' },
    ],
  },
  {
    heading: 'Your account',
    links: [
      { label: 'Sign in', href: '/login' },
      { label: 'Create an account', href: '/register' },
      { label: 'Orders', href: '/orders' },
      { label: 'Wishlist', href: '/wishlist' },
      { label: 'Profile and addresses', href: '/account' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { label: 'Delivery and coverage', href: '/products' },
      { label: 'Returns and exchanges', href: '/orders' },
      { label: 'Payment methods', href: '/checkout' },
      { label: 'Track an order', href: '/orders' },
    ],
  },
];

/**
 * Social links get their brand colour on hover rather than at rest: five
 * saturated icons in a row read as an advert, one lighting up under the cursor
 * reads as a control.
 */
const SOCIAL = [
  { label: 'Facebook', Icon: Facebook, href: 'https://facebook.com', hover: 'hover:bg-[#1877F2]' },
  { label: 'Instagram', Icon: Instagram, href: 'https://instagram.com', hover: 'hover:bg-[#E1306C]' },
  { label: 'X', Icon: Twitter, href: 'https://x.com', hover: 'hover:bg-[#0F172A]' },
  { label: 'YouTube', Icon: Youtube, href: 'https://youtube.com', hover: 'hover:bg-[#FF0000]' },
  { label: 'LinkedIn', Icon: Linkedin, href: 'https://linkedin.com', hover: 'hover:bg-[#0A66C2]' },
];

/**
 * The payment rail. Wordmarks rather than logo images - the store has no
 * licensed logo assets, and a mis-drawn logo is worse than a clean wordmark.
 *
 * The reds carry a lighter dark-mode value: the real brand hues land between
 * 2.9:1 and 3.9:1 on the dark card, which is under AA for 12px text.
 */
const PAYMENTS = [
  { label: 'eSewa', className: 'text-[#60BB46]' },
  { label: 'Khalti', className: 'text-[#5C2D91] dark:text-[#A78BFA]' },
  { label: 'ConnectIPS', className: 'text-[#E31E24] dark:text-[#FF9098]' },
  { label: 'IME Pay', className: 'text-[#C8102E] dark:text-[#FF8FA0]' },
  { label: 'Fonepay', className: 'text-[#EE1C25] dark:text-[#FF9298]' },
  { label: 'Visa', className: 'text-[#1A1F71] dark:text-[#8AA1FF]' },
  { label: 'Mastercard', className: 'text-[#EB001B] dark:text-[#FF9095]' },
  { label: 'Cash on delivery', className: 'text-ok' },
];

/** The storefront footer, mounted once by the (shop) layout. */
export function SiteFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    // `className` is how the shop shell reserves the height of the fixed bottom
    // navigation, so the last footer row is never trapped underneath it.
    <footer className={cn('bz-defer-paint mt-auto border-t border-border bg-card/40', className)}>
      <div className="container-bazaar py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* --- Brand ----------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-2">
            <Link
              href="/"
              className="font-display inline-block text-xl font-extrabold tracking-tight"
            >
              Bazaar
            </Link>
            <p className="max-w-sm text-sm text-muted-foreground text-pretty">
              Electronics, fashion and home essentials, delivered to all{' '}
              <span className="numeric">{NEPAL_DISTRICTS.length}</span> districts of Nepal.
              Pay with eSewa, Khalti, card or cash on delivery.
            </p>

            <ul className="flex flex-wrap items-center gap-2 pt-1">
              {SOCIAL.map(({ label, Icon, href, hover }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={label}
                    className={cn(
                      'grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors duration-200 hover:border-transparent hover:text-white',
                      hover,
                    )}
                  >
                    <Icon className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* --- Link columns ---------------------------------------------- */}
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading} className="space-y-3">
              <h2 className="font-display text-sm font-semibold tracking-tight">
                {column.heading}
              </h2>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group/foot inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span className="bg-gradient-to-r from-primary to-primary bg-[length:0%_1px] bg-left-bottom bg-no-repeat transition-[background-size] duration-300 group-hover/foot:bg-[length:100%_1px]">
                        {link.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* --- Payments ---------------------------------------------------- */}
        <div className="mt-12 border-t border-border pt-8">
          <h2 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Ways to pay
          </h2>
          <ul className="mt-3 flex flex-wrap items-center gap-2">
            {PAYMENTS.map((payment) => (
              <li
                key={payment.label}
                className={cn(
                  'rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
                  payment.className,
                )}
              >
                {payment.label}
              </li>
            ))}
          </ul>
        </div>

        {/* --- Legal ------------------------------------------------------- */}
        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="numeric">© {year} Bazaar. All rights reserved.</p>
          <p>Built in Kathmandu. Prices in Nepalese rupees, inclusive of VAT.</p>
        </div>
      </div>
    </footer>
  );
}
