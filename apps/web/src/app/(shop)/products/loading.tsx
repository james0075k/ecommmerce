import { ProductGridSkeleton } from '@/components/shop/product-grid-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Streamed while the listing route's server work is in flight (Phase 11).
 *
 * The shell - header, footer, bottom navigation - is already on screen by the
 * time this renders, so what it stands in for is the toolbar and the grid. Both
 * are laid out at the size the real thing will be, which is what keeps the swap
 * off the CLS budget (J1: < 0.05).
 */
export default function ProductsLoading() {
  return (
    <div className="container-bazaar py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="bz-shimmer h-8 w-44" />
        <div className="flex gap-2">
          <Skeleton className="bz-shimmer h-10 w-28" />
          <Skeleton className="bz-shimmer h-10 w-44" />
        </div>
      </div>

      <ProductGridSkeleton />
      <span className="sr-only" role="status">
        Loading products
      </span>
    </div>
  );
}
