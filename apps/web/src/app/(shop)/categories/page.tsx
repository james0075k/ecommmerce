import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight, PackageOpen } from 'lucide-react';

import { getCategoryTree } from '@/lib/catalog-server';
import type { CategoryNode } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Categories',
  description:
    'Every department in the Bazaar catalog - electronics, fashion, home and more, with delivery to all 77 districts.',
  alternates: { canonical: '/categories' },
};

/**
 * The category index (Phase 11).
 *
 * The mobile bottom navigation has a Categories tab, and on a phone there is no
 * mega menu behind it - so this page is the department list. On a desktop it is
 * a legitimate landing page in its own right and the sitemap entry the mega
 * menu never gave crawlers.
 *
 * A server component with no client JavaScript at all: the tree is fetched on
 * the server through Next's data cache (one hour, matching the API's own TTL),
 * so this route ships markup and images and nothing else. That is what keeps it
 * off the initial bundle budget entirely.
 */
export default async function CategoriesPage() {
  const tree = await getCategoryTree();

  return (
    <div className="container-bazaar py-8 md:py-12">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-4xl">
          Shop by category
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {tree.length > 0
            ? 'Every department in the catalogue. Tap one to browse it, or open a sub-category to go straight there.'
            : 'The catalogue is being set up. Browse all products in the meantime.'}
        </p>
      </header>

      {tree.length === 0 ? <EmptyState /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tree.map((category) => (
          <CategoryTile key={category.id} category={category} />
        ))}
      </div>
    </div>
  );
}

/**
 * One department: its image, its count, and its children as direct links.
 *
 * The children are separate anchors rather than part of one big tile link -
 * nesting interactive elements is invalid HTML and leaves a screen reader with
 * no way to reach the sub-category. The tile's own link is the heading.
 */
function CategoryTile({ category }: { category: CategoryNode }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow duration-200 hover:shadow-float">
      <Link
        href={`/products?category=${category.slug}`}
        className="relative block aspect-[16/9] overflow-hidden bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {category.imageUrl ? (
          <Image
            src={category.imageUrl}
            alt=""
            fill
            // Two columns from 640px, three from 1024px, capped by the container.
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <PackageOpen className="size-8 text-muted-foreground" aria-hidden />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4">
          <h2 className="font-display text-lg font-semibold text-white">{category.name}</h2>
          <p className="numeric text-xs text-white/80">
            {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
          </p>
        </div>
      </Link>

      {category.children.length > 0 ? (
        <ul className="flex flex-col p-2">
          {category.children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/products?category=${child.slug}`}
                // 44px minimum touch target, which at this text size needs the
                // padding rather than the line box alone.
                className="flex min-h-11 items-center justify-between gap-2 rounded-md px-3 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="truncate">{child.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <span className="numeric">{child.productCount}</span>
                  <ChevronRight className="size-3.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <PackageOpen className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">
        No categories to show yet.{' '}
        <Link href="/products" className="text-primary underline underline-offset-4">
          Browse all products
        </Link>
        .
      </p>
    </div>
  );
}
