'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { CART_UNDO_WINDOW_MS } from '@bazaar/shared/constants';
import type { CartLine } from '@bazaar/shared';
import { blurProps, formatPrice } from '@bazaar/ui';

import { QuantityStepper } from '@/components/cart/cart-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/lib/store/cart-store';
import { cn } from '@/lib/utils';

/** Drag past this and releasing removes the line. Roughly a third of a phone. */
const SWIPE_COMMIT_PX = 120;

/**
 * One line of the cart.
 *
 * `swipeToDelete` turns the row into a draggable that reveals a red delete
 * track as it moves left, for the full-page mobile cart. The drawer leaves it
 * off: a horizontal drag inside a panel that itself slides in from the right is
 * a gesture collision, and the drawer already has a visible trash button.
 *
 * Removal always goes through the store's undo contract, whichever way it was
 * triggered - a swipe is easier to do by accident than a button press, so it
 * needs the 5-second window more, not less.
 */
export function CartLineRow({
  line,
  onNavigate,
  swipeToDelete = false,
}: {
  line: CartLine;
  onNavigate?: () => void;
  swipeToDelete?: boolean;
}) {
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const isBusy = useCartStore((state) => state.busyLineIds.includes(line.id));

  const variantLabel = Object.entries(line.variant.attributes)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');

  const handleRemove = React.useCallback(async () => {
    try {
      const { line: removed, restore } = await removeItem(line.id);

      // G1: a 5-second window to undo. The toast owns the whole affordance -
      // there is no separate "recently removed" tray to keep in sync.
      toast(`${removed.product.name} removed.`, {
        duration: CART_UNDO_WINDOW_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            void restore().catch(() =>
              toast.error('That item could not be restored - it may have sold out.'),
            );
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove that item.');
    }
  }, [line.id, removeItem]);

  const handleQuantity = (quantity: number) => {
    void updateQuantity(line.id, quantity).catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : 'Could not update the quantity.'),
    );
  };

  const x = useMotionValue(0);
  // The track fades in as the row uncovers it, so the red is proportional to
  // how committed the gesture is.
  const trackOpacity = useTransform(x, [-SWIPE_COMMIT_PX, -24, 0], [1, 0.5, 0]);

  const body = (
    <div className={cn('flex gap-3 py-4', isBusy && 'opacity-60')}>
      <Link
        href={`/products/${line.product.slug}`}
        onClick={onNavigate}
        className="relative size-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
      >
        {line.product.image ? (
          <Image
            src={line.product.image.url}
            alt={line.product.image.altText ?? line.product.name}
            fill
            sizes="80px"
            className="object-cover"
            {...blurProps(line.product.image.blurhash)}
          />
        ) : (
          <span className="grid h-full place-items-center text-[10px] text-muted-foreground">
            No image
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm leading-snug font-medium">
              <Link
                href={`/products/${line.product.slug}`}
                onClick={onNavigate}
                className="hover:underline"
              >
                {line.product.name}
              </Link>
            </h3>
            {variantLabel ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{variantLabel}</p>
            ) : null}
          </div>

          {/* Kept even when swiping is available: a swipe is not discoverable,
              and it is not reachable from a keyboard at all. */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void handleRemove()}
            disabled={isBusy}
            aria-label={`Remove ${line.product.name} from cart`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {line.isOutOfStock ? (
          <Badge variant="destructive" className="w-fit">
            Out of stock
          </Badge>
        ) : line.isPartiallyAvailable ? (
          <Badge className="w-fit bg-warning text-black">
            Only {line.availableQuantity} left
          </Badge>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <QuantityStepper
            value={line.quantity}
            max={line.maxQuantity}
            disabled={isBusy || line.isOutOfStock}
            onChange={handleQuantity}
          />

          <div className="text-right">
            <p className="numeric text-sm font-semibold">
              {formatPrice(line.lineTotal, line.product.currency)}
            </p>
            {line.quantity > 1 ? (
              <p className="numeric text-xs text-muted-foreground">
                {formatPrice(line.unitPrice, line.product.currency)} each
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      className="relative overflow-hidden"
    >
      {swipeToDelete ? (
        <>
          <motion.div
            aria-hidden
            style={{ opacity: trackOpacity }}
            className="absolute inset-y-0 right-0 flex w-full items-center justify-end gap-2 rounded-md bg-destructive/15 pr-5 text-sm font-medium text-destructive"
          >
            <Trash2 className="size-4" />
            Remove
          </motion.div>

          <motion.div
            drag="x"
            style={{ x }}
            // Only leftwards: a rightward drag on a phone is the browser's
            // back gesture, and fighting it loses.
            dragConstraints={{ left: -SWIPE_COMMIT_PX - 40, right: 0 }}
            dragElastic={{ left: 0.2, right: 0 }}
            dragDirectionLock
            onDragEnd={(_event, info) => {
              // Either far enough or fast enough - a short flick is as clear an
              // intent as a slow drag across the whole row.
              if (info.offset.x < -SWIPE_COMMIT_PX || info.velocity.x < -600) {
                void handleRemove();
              }
            }}
            className="relative bg-background"
          >
            {body}
          </motion.div>
        </>
      ) : (
        body
      )}
    </motion.li>
  );
}
