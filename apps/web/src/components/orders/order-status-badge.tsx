import { OrderStatus } from '@bazaar/shared';

import { cn } from '@/lib/utils';

/**
 * Colour carries the same meaning everywhere an order appears - the list, the
 * detail header, the admin table - so the mapping lives here rather than being
 * re-picked per screen.
 *
 * Every pairing is also distinguishable without colour: the label is always
 * spelled out, because "green means fine" is invisible to a colour-blind
 * operator scanning a hundred rows, and the words are what they read anyway.
 */
const STATUS_STYLES: Record<string, string> = {
  [OrderStatus.PENDING]: 'bg-muted text-muted-foreground ring-border',
  [OrderStatus.CONFIRMED]: 'bg-primary/10 text-primary ring-primary/20',
  [OrderStatus.PROCESSING]: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400',
  [OrderStatus.SHIPPED]: 'bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-400',
  [OrderStatus.DELIVERED]:
    'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400',
  [OrderStatus.CANCELLED]: 'bg-destructive/10 text-destructive ring-destructive/25',
  [OrderStatus.REFUNDED]: 'bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-400',
};

export const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PENDING]: 'Awaiting payment',
  [OrderStatus.CONFIRMED]: 'Confirmed',
  [OrderStatus.PROCESSING]: 'Packing',
  [OrderStatus.SHIPPED]: 'Shipped',
  [OrderStatus.DELIVERED]: 'Delivered',
  [OrderStatus.CANCELLED]: 'Cancelled',
  [OrderStatus.REFUNDED]: 'Refunded',
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 w-fit shrink-0 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset',
        STATUS_STYLES[status] ?? STATUS_STYLES[OrderStatus.PENDING],
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
