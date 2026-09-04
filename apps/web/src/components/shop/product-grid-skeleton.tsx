import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Matches the real grid's shape so the swap does not shift layout (J1: CLS < 0.05). */
export function ProductGridSkeleton({
  count = 12,
  className,
}: {
  count?: number;
  /** Overrides the column track when the grid it stands in for differs. */
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-md border border-border bg-card">
          <Skeleton className="bz-shimmer aspect-square w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="bz-shimmer h-3 w-16" />
            <Skeleton className="bz-shimmer h-4 w-full" />
            <Skeleton className="bz-shimmer h-3 w-24" />
            <Skeleton className="bz-shimmer h-5 w-20" />
            <Skeleton className="bz-shimmer h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
