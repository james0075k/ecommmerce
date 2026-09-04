'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Slot } from 'radix-ui';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A call to action whose fill grows out of the point the cursor entered from,
 * and retreats towards the point it left by.
 *
 * The ripple is a plain span scaled by the compositor rather than a background
 * animation, so it costs nothing on the main thread. `isolate` on the button
 * plus `-z-10` on the ripple puts it behind the label without needing a wrapper
 * around the content, and it is `aria-hidden`, so the button reads exactly the
 * same as one without it.
 *
 * `Slottable` is what makes this work with `asChild`. Radix's Slot expects a
 * single element child, and a ripple plus a `<Link>` is two - marking the link
 * as the slottable one tells Slot to render the link and fold the ripple in as
 * one of its children, rather than failing on the extra element.
 */
export function RippleButton({
  children,
  className,
  rippleClassName,
  asChild = false,
  ...props
}: React.ComponentProps<typeof Button> & { rippleClassName?: string }) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLButtonElement>(null);
  const [origin, setOrigin] = React.useState({ x: 50, y: 50 });
  const [active, setActive] = React.useState(false);

  const positionFrom = (event: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setOrigin({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <Button
      ref={ref}
      asChild={asChild}
      className={cn('relative isolate overflow-hidden', className)}
      onPointerEnter={(event) => {
        positionFrom(event);
        setActive(true);
      }}
      onPointerLeave={(event) => {
        positionFrom(event);
        setActive(false);
      }}
      {...props}
    >
      {reduced ? null : (
        <motion.span
          // Keyed because Slot rebuilds the children as an array when the
          // ripple is folded into the slotted element.
          key="ripple"
          aria-hidden
          className={cn(
            'absolute -z-10 aspect-square w-[140%] rounded-full bg-white/20',
            rippleClassName,
          )}
          style={{
            left: `${origin.x}%`,
            top: `${origin.y}%`,
            translateX: '-50%',
            translateY: '-50%',
          }}
          initial={false}
          animate={{ scale: active ? 1 : 0, opacity: active ? 1 : 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      )}

      <Slot.Slottable key="content">{children}</Slot.Slottable>
    </Button>
  );
}
