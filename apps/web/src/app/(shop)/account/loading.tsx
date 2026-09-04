import { Skeleton } from '@/components/ui/skeleton';

/** The account shell: heading, tab row, then the panel body. */
export default function AccountLoading() {
  return (
    <div className="container-bazaar max-w-3xl py-8">
      <Skeleton className="bz-shimmer mb-6 h-9 w-56" />

      <div className="mb-6 flex gap-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="bz-shimmer h-10 w-28" />
        ))}
      </div>

      <Skeleton className="bz-shimmer h-72 w-full rounded-md" />

      <span className="sr-only" role="status">
        Loading your account
      </span>
    </div>
  );
}
