import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // `bz-focus-glow` replaces the static focus ring with one that grows out of
        // the border over 240ms (H2). It sets `box-shadow`, so it also supersedes
        // the ring utility rather than stacking with it.
        // Nearly square, against the fully round buttons beside it: the shape
        // is what tells you which one you type into and which one you press.
        // `bz-focus-glow` replaces the static focus ring with one that grows out
        // of the border over 240ms. It sets `box-shadow`, so it supersedes the
        // ring utility rather than stacking with it.
        "bz-focus-glow h-10 w-full min-w-0 rounded-sm border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
