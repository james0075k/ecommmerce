'use client';

import { motion } from 'framer-motion';

import { staggerChildren } from '@bazaar/ui';

import { ProductCard } from '@/components/shop/product-card';
import type { ProductListItem } from '@/lib/catalog';
import { cn } from '@/lib/utils';

/**
 * The catalogue grid: H3 columns (1 / 2 / 3 / 4) with the H2 50ms stagger.
 *
 * A client component so the cards keep their hover, wishlist and add-to-cart
 * behaviour, but it takes its products as a prop - which is what lets a server
 * component (the category pages, the first page of the listing) render the grid
 * into the HTML and hand the browser something already painted.
 *
 * `eagerCount` marks the first row as the LCP candidate. Only the images
 * actually above the fold get it: fetching sixteen at high priority would
 * slow down the one that matters.
 */
export function ProductGrid({
  products,
  className,
  eagerCount = 0,
}: {
  products: ProductListItem[];
  className?: string;
  /** How many leading cards load eagerly. One row's worth, at most. */
  eagerCount?: number;
}) {
  return (
    <motion.div
      variants={staggerChildren(0.05)}
      initial="hidden"
      animate="visible"
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className,
      )}
    >
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} eager={index < eagerCount} />
      ))}
    </motion.div>
  );
}
