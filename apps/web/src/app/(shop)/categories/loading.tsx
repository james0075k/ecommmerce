import { Skeleton } from '@/components/ui/skeleton';

/** Six department tiles at the real aspect ratio, so nothing moves on swap. */
export default function CategoriesLoading() {
  return (
    <div className="container-bazaar py-8 md:py-12">
      <Skeleton className="bz-shimmer mb-3 h-10 w-64" />
      <Skeleton className="bz-shimmer mb-8 h-4 w-full max-w-prose" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-lg border border-border bg-card">
            <Skeleton className="bz-shimmer aspect-[16/9] w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="bz-shimmer h-8 w-full" />
              <Skeleton className="bz-shimmer h-8 w-4/5" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Loading categories
      </span>
    </div>
  );
}
