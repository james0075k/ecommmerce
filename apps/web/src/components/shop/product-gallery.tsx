'use client';

import * as React from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';

import type { ProductImageDetail } from '@/lib/catalog';
import { cn } from '@/lib/utils';

/**
 * H2: thumbnails crossfade with a slight scale over 300ms. Desktop gets
 * zoom-on-hover driven by transform-origin; touch devices keep native
 * pinch-to-zoom because the image is a plain img with no gesture handlers
 * intercepting it.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: ProductImageDetail[];
  productName: string;
}) {
  const [index, setIndex] = React.useState(0);
  const [origin, setOrigin] = React.useState('50% 50%');
  const [zoomed, setZoomed] = React.useState(false);

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
        className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => {
          setZoomed(false);
          setOrigin('50% 50%');
        }}
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - bounds.left) / bounds.width) * 100;
          const y = ((event.clientY - bounds.top) / bounds.height) * 100;
          setOrigin(`${x}% ${y}%`);
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            <Image
              src={active.url}
              alt={active.altText ?? productName}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              style={{ transformOrigin: origin }}
              className={cn(
                'object-cover transition-transform duration-200 ease-out',
                // Hover zoom is pointer-only; touch users pinch instead.
                zoomed && 'md:scale-[1.8]',
              )}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {images.length > 1 ? (
        <ul className="grid grid-cols-5 gap-2" role="tablist" aria-label="Product images">
          {images.map((image, position) => (
            <li key={image.id}>
              <button
                type="button"
                role="tab"
                aria-selected={position === index}
                aria-label={`View image ${position + 1} of ${images.length}`}
                onClick={() => setIndex(position)}
                className={cn(
                  'relative block aspect-square w-full overflow-hidden rounded-md border-2 transition-colors',
                  position === index
                    ? 'border-primary'
                    : 'border-transparent hover:border-border',
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
