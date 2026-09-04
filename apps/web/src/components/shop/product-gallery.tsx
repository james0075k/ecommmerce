'use client';

import * as React from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { blurProps } from '@bazaar/ui';

import type { ProductImageDetail } from '@/lib/catalog';
import { useFinePointer } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';

/** Past this much horizontal travel a release counts as a swipe, not a tap. */
const SWIPE_DISTANCE_PX = 60;

/** A fast flick counts even when it did not travel far. */
const SWIPE_VELOCITY = 400;

/**
 * The product gallery.
 *
 * H2: thumbnails crossfade with a slight scale over 300ms. Desktop gets
 * zoom-on-hover driven by transform-origin.
 *
 * Phase 11 adds the touch half. On a phone the thumbnail strip is a row of
 * 60px targets under an image that fills the screen, and nobody uses it - the
 * gesture people actually reach for is a swipe. So the frame is draggable on
 * the horizontal axis, the slide follows the finger, and a release past either
 * threshold commits to the next or previous image.
 *
 * `dragDirectionLock` is what keeps this from breaking the page: without it a
 * mostly-vertical drag that starts inside the frame is captured here and the
 * page stops scrolling. With it, the first few pixels decide which axis owns
 * the gesture and a vertical one is handed straight back to the scroller.
 *
 * Pinch-to-zoom still works, because Framer's drag is a single-pointer
 * interaction and never touches a two-finger gesture.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: ProductImageDetail[];
  productName: string;
}) {
  const [index, setIndex] = React.useState(0);
  // +1 when moving forwards, -1 when moving back. The slide has to know which
  // way it is going or every transition animates in from the same side.
  const [direction, setDirection] = React.useState(0);
  const [origin, setOrigin] = React.useState('50% 50%');
  const [zoomed, setZoomed] = React.useState(false);

  const finePointer = useFinePointer();
  const reduced = useReducedMotion();

  const count = images.length;

  const go = React.useCallback(
    (target: number, from: number) => {
      if (count === 0) return;
      setDirection(from);
      // Wraps in both directions: at the last image a forward swipe returns to
      // the first, which is what a carousel of five photos should do.
      setIndex(((target % count) + count) % count);
    },
    [count],
  );

  const goNext = React.useCallback(() => go(index + 1, 1), [go, index]);
  const goPrevious = React.useCallback(() => go(index - 1, -1), [go, index]);

  const active = images[index];

  if (!active) {
    return (
      <div className="grid aspect-square place-items-center rounded-lg border border-border bg-muted text-sm text-muted-foreground">
        No image
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
        // Arrow keys step through the gallery, which is the keyboard equivalent
        // of the swipe. The role and label are what make a focusable div here
        // legitimate rather than a trap.
        role="group"
        aria-roledescription="carousel"
        aria-label={productName + ' images'}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            goNext();
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goPrevious();
          }
        }}
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => {
          setZoomed(false);
          setOrigin('50% 50%');
        }}
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - bounds.left) / bounds.width) * 100;
          const y = ((event.clientY - bounds.top) / bounds.height) * 100;
          setOrigin(x + '% ' + y + '%');
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.id}
            // On a touch device the image travels; on a desktop it crossfades,
            // which is the H2 behaviour and the one a mouse expects.
            initial={
              reduced
                ? { opacity: 1 }
                : finePointer
                  ? { opacity: 0, scale: 1.02 }
                  : { opacity: 0, x: direction * 40 }
            }
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={
              reduced
                ? { opacity: 1 }
                : finePointer
                  ? { opacity: 0 }
                  : { opacity: 0, x: direction * -40 }
            }
            transition={{ duration: reduced ? 0 : 0.3, ease: 'easeInOut' }}
            drag={count > 1 && !finePointer ? 'x' : false}
            dragDirectionLock
            dragElastic={0.18}
            // The slide springs back to centre; changing the index is what
            // actually moves the gallery on.
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_event, info) => {
              const travelled = info.offset.x;
              const flicked = Math.abs(info.velocity.x) > SWIPE_VELOCITY;

              if (travelled < -SWIPE_DISTANCE_PX || (flicked && travelled < 0)) goNext();
              else if (travelled > SWIPE_DISTANCE_PX || (flicked && travelled > 0)) goPrevious();
            }}
            // Vertical panning stays with the page even while this element is
            // the drag target, so the listing never feels stuck.
            className="absolute inset-0 touch-pan-y"
          >
            <Image
              src={active.url}
              alt={active.altText ?? productName}
              fill
              // The gallery holds the LCP element on this route, and unlike the
              // listing grid there is exactly one candidate at every viewport -
              // so this is the case `preload` is for. (`priority` is the Next 15
              // spelling and is deprecated in 16.)
              preload={index === 0}
              sizes="(max-width: 1024px) 100vw, 50vw"
              style={{ transformOrigin: origin }}
              // Without this the browser's native image drag fights the gesture
              // on a trackpad.
              draggable={false}
              className={cn(
                'object-cover transition-transform duration-200 ease-out',
                // Hover zoom is pointer-only; touch users pinch instead.
                zoomed && 'md:scale-[1.8]',
              )}
              {...blurProps(active.blurhash)}
            />
          </motion.div>
        </AnimatePresence>

        {count > 1 ? (
          <>
            {/* Arrows appear on hover, so they exist for a mouse and are out of
                the way on touch, where the swipe is the affordance and two
                buttons over the photo would cover the thing being looked at. */}
            <GalleryArrow side="left" onClick={goPrevious} label="Previous image" />
            <GalleryArrow side="right" onClick={goNext} label="Next image" />

            {/* Dots stand in for the thumbnail strip below `sm`, where five
                thumbnails are too small to aim at. */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 sm:hidden"
            >
              {images.map((image, position) => (
                <span
                  key={image.id}
                  className={cn(
                    'h-1.5 rounded-full bg-white/60 transition-all duration-200',
                    position === index ? 'w-5 bg-white' : 'w-1.5',
                  )}
                />
              ))}
            </div>
          </>
        ) : null}

        {/* The visual swap is the only other signal that anything happened. */}
        <span aria-live="polite" className="sr-only">
          {'Image ' + (index + 1) + ' of ' + count}
        </span>
      </div>

      {count > 1 ? (
        <ul className="grid grid-cols-5 gap-2" role="tablist" aria-label="Product images">
          {images.map((image, position) => (
            <li key={image.id}>
              <button
                type="button"
                role="tab"
                aria-selected={position === index}
                aria-label={'View image ' + (position + 1) + ' of ' + count}
                onClick={() => go(position, position > index ? 1 : -1)}
                className={cn(
                  'relative block aspect-square w-full overflow-hidden rounded-md border-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  position === index ? 'border-primary' : 'border-transparent hover:border-border',
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                  aria-hidden
                  {...blurProps(image.blurhash)}
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A step control for pointer users. Revealed on hover over the frame and
 * whenever it takes focus, so a keyboard user can see what they are on.
 */
function GalleryArrow({
  side,
  onClick,
  label,
}: {
  side: 'left' | 'right';
  onClick: () => void;
  label: string;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:bg-background focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-hover:opacity-100',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
