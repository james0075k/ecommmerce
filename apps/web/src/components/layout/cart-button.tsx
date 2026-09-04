'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/lib/hooks/use-media-query';
import { selectCartCount, useCartStore } from '@/lib/store/cart-store';
import { cn } from '@/lib/utils';

/**
 * The navbar cart icon and its count badge.
 *
 * H2: the icon bounces to 1.3 and settles over 400ms whenever something is
 * added. The animation is a CSS class (`bz-cart-bounce`, from the Phase 1
 * catalog) rather than Framer Motion - it is a one-shot keyframe with no
 * orchestration, and CSS is both cheaper and already disabled under
 * prefers-reduced-motion.
 *
 * Replaying it is done with a `key` derived from the store's add counter: a
 * changing key remounts the element, and a fresh element restarts its CSS
 * animation. Doing it with an effect and a timer would mean calling setState
 * during an effect on every add, which is the cascading-render pattern React
 * warns about.
 *
 * Phase 11: below `lg` this navigates to `/cart` rather than opening the
 * drawer. The drawer's whole value is keeping the page behind it visible, which
 * a panel the width of a phone does not do.
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

  const content = (
    <>
      <span key={`icon-${bounceToken}`} className={cn('contents', bounce)}>
        <ShoppingCart className={cn('size-4', bounce)} />
      </span>

      {ready && count > 0 ? (
        <span
          key={`badge-${bounceToken}`}
          className={cn(
            'numeric absolute -top-1.5 -right-1.5 grid min-w-4.5 place-items-center rounded-full bg-primary-solid px-1 text-[10px] leading-4.5 font-semibold text-primary-foreground',
            bounce,
          )}
          // The button's aria-label already announces the count; repeating it
          // here would read it twice.
          aria-hidden
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </>
  );

  const className = cn('relative', overlay && 'text-white hover:bg-white/15 hover:text-white');
  const label = count > 0 ? `${count} items in your cart` : 'Your cart';

  if (isMobile) {
    return (
      <Button
        asChild
        variant={overlay ? 'ghost' : 'outline'}
        size="icon"
        className={className}
        aria-label={label}
      >
        <Link href="/cart">{content}</Link>
      </Button>
    );
  }

  return (
    <Button
      variant={overlay ? 'ghost' : 'outline'}
      size="icon"
      onClick={open}
      className={className}
      aria-label={count > 0 ? `Open cart, ${count} items` : 'Open cart'}
    >
      {content}
    </Button>
  );
}
