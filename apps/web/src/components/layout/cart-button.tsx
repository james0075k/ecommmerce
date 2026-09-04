'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';

import { useIsMobile } from '@/lib/hooks/use-media-query';
import { selectCartCount, useCartStore } from '@/lib/store/cart-store';
import { cn } from '@/lib/utils';

/**
 * The navbar cart control.
 *
 * On a pointer it is a word and a number - "Cart (2)" - because the count is
 * the information and a superscript badge on an icon makes you squint at it.
 * Below `lg` the label gives way to the bag icon, and the tap navigates to
 * `/cart` rather than opening the drawer: the drawer earns its keep by leaving
 * the page behind it visible, which a panel the width of a phone does not.
 *
 * The count bounces to 1.3 and settles over 400ms whenever something is added.
 * The animation is a CSS class (`bz-cart-bounce`) rather than Framer Motion -
 * it is a one-shot keyframe with no orchestration, and CSS is both cheaper and
 * already disabled under prefers-reduced-motion.
 *
 * Replaying it is done with a `key` derived from the store's add counter: a
 * changing key remounts the element, and a fresh element restarts its CSS
 * animation. Doing it with an effect and a timer would mean calling setState
 * during an effect on every add, which is the cascading-render pattern React
 * warns about.
 */
export function CartButton({ overlay = false }: { overlay?: boolean }) {
  const open = useCartStore((state) => state.open);
  const count = useCartStore(selectCartCount);
  const ready = useCartStore((state) => state.ready);
  const bounceToken = useCartStore((state) => state.bounceToken);
  const isMobile = useIsMobile();

  // Token 0 is the initial mount, not an add - bouncing there would animate
  // something the shopper did not do.
  const bounce = bounceToken > 0 && 'bz-cart-bounce';

  const className = cn(
    'bz-label bz-underline inline-flex cursor-pointer items-center py-1.5 transition-colors duration-[260ms] max-lg:justify-center',
    overlay ? 'text-white/85 hover:text-white' : 'text-muted-foreground hover:text-foreground',
  );

  const label = count > 0 ? `${count} items in your cart` : 'Your cart';

  const content = (
    <>
      <ShoppingBag
        key={`icon-${bounceToken}`}
        className={cn('size-5 lg:hidden', bounce)}
        aria-hidden
      />
      <span className="hidden lg:inline">
        Cart{' '}
        <span key={`count-${bounceToken}`} className={cn('numeric inline-block', bounce)}>
          ({ready ? (count > 99 ? '99+' : count) : 0})
        </span>
      </span>
    </>
  );

  if (isMobile) {
    return (
      <Link href="/cart" data-slot="nav-control" className={className} aria-label={label}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      data-slot="nav-control"
      className={className}
      aria-label={count > 0 ? `Open cart, ${count} items` : 'Open cart'}
    >
      {content}
    </button>
  );
}
