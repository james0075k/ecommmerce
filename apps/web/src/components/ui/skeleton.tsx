import { cn } from "@/lib/utils"

/**
 * The loading placeholder. `bz-shimmer` is the H2 sweep - a gradient moving
 * left to right over 1.5s - layered on top of the muted fill rather than
 * replacing it, so a skeleton still has a shape when the sweep is disabled by
 * prefers-reduced-motion.
 *
 * A blank screen is never the loading state anywhere in this app; this is what
 * stands in.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bz-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
