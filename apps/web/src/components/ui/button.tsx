import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Every control in the system is a pill. The press affordance is a single
  // pixel of travel and nothing else: no scale, no shadow lift, no bounce. The
  // brand's motion is slow and settles, and a button that springs under the
  // cursor is the one thing in the interface that would contradict that.
  //
  // The transition is 260ms rather than 200 for the same reason - long enough
  // for the outline variant's fill to read as the button filling in.
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // `primary-solid` rather than `primary`: the two differ in dark mode,
        // where the ink and the ground trade places and the fill becomes the
        // pale value carrying dark text.
        default:
          "bg-primary-solid text-primary-foreground hover:bg-[var(--bz-primary-hover)]",
        // The signature interaction: an outline button does not tint on hover,
        // it fills. The border colour floods the button and the label inverts,
        // which is a state change you can read from across the page rather
        // than a five-percent background wash you have to look for.
        outline:
          "border-foreground/25 text-foreground hover:border-primary-solid hover:bg-primary-solid hover:text-primary-foreground aria-expanded:border-primary-solid aria-expanded:bg-primary-solid aria-expanded:text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/60",
        destructive:
          "bg-destructive/10 text-danger hover:bg-destructive hover:text-destructive-foreground focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/15 dark:focus-visible:ring-destructive/40",
        // Not underlined at rest - the rule is drawn from the left on hover,
        // matching every other link in the layout.
        link: "bz-underline rounded-none px-0 text-foreground",
      },
      size: {
        // A pill needs horizontal room its rectangular ancestor did not: the
        // curve eats the first and last few pixels of the padding box, so the
        // label sits closer to the edge than the number suggests.
        default:
          "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3.5 text-[0.8rem] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        // `lg` is the storefront's call to action - add to cart, check out,
        // place order, subscribe - and it is the one size that takes the
        // brand's uppercase label treatment. Anything smaller is a control in
        // a toolbar or a table, where shouting would be noise.
        // Spelled out as utilities rather than reusing `.bz-label-lg`: that
        // class lives in the components layer, and the base row's `text-sm`
        // and `font-medium` are utilities, which would win.
        lg: "h-11 gap-2 px-7 text-[0.8125rem] font-semibold tracking-[0.09em] uppercase has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
