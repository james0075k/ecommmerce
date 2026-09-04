import Link from 'next/link';

/**
 * The shipping promise, above everything else on the page.
 *
 * It scrolls away rather than sticking: it is a single fact a shopper needs
 * once, and a permanently pinned strip would eat vertical space on a phone for
 * the rest of the session.
 *
 * Deliberately not a rotator. The hero below is already a carousel, and two
 * things moving on their own above the fold means neither one gets read.
 */
export function AnnouncementBar() {
  return (
    <div className="bg-background px-[var(--bz-inset)] pt-[var(--bz-inset)]">
      <p className="rounded-[var(--radius-md)] bg-card py-3 text-center">
        <Link
          href="/products"
          className="bz-label bz-underline text-muted-foreground transition-colors duration-[260ms] hover:text-foreground"
        >
          Free delivery on orders over Rs 5,000
        </Link>
      </p>
    </div>
  );
}
