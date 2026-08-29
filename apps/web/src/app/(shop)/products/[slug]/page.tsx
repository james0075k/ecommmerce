import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import type { ProductDetail } from '@/lib/catalog';
import { ProductDetailView } from './product-detail-view';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * Server-rendered so the page ships full meta tags and JSON-LD (J2), which is
 * the whole point of putting product detail on the server rather than fetching
 * it in the browser.
 */
async function fetchProduct(slug: string): Promise<ProductDetail | null> {
  try {
    const response = await fetch(`${API_URL}/products/${encodeURIComponent(slug)}`, {
      // Product data changes when an admin edits it; a short revalidate keeps
      // pages fast without serving a stale price for long.
      next: { revalidate: 60 },
    });

    if (!response.ok) return null;
    return (await response.json()) as ProductDetail;
  } catch {
    // The API being down should render a 404 page, not an unhandled crash.
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);

  if (!product) return { title: 'Product not found' };

  const image = product.images.find((entry) => entry.isPrimary) ?? product.images[0];

  return {
    title: product.metaTitle ?? product.name,
    description:
      product.metaDescription ??
      product.shortDescription ??
      `Buy ${product.name} at Bazaar.`,
    alternates: { canonical: `${SITE_URL}/products/${product.slug}` },
    openGraph: {
      type: 'website',
      title: product.name,
      description: product.shortDescription ?? undefined,
      url: `${SITE_URL}/products/${product.slug}`,
      images: image ? [{ url: image.url, alt: image.altText ?? product.name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      images: image ? [image.url] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await fetchProduct(slug);

  if (!product) notFound();

  return (
    <>
      {/* J2: Product + AggregateRating + BreadcrumbList structured data. */}
      <script
        type="application/ld+json"
        // The payload is JSON.stringify of our own data, never user HTML.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(product)) }}
      />
      <ProductDetailView product={product} />
    </>
  );
}

function buildJsonLd(product: ProductDetail) {
  const image = product.images.find((entry) => entry.isPrimary) ?? product.images[0];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: product.name,
        sku: product.sku,
        description: product.shortDescription ?? undefined,
        image: image?.url,
        brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
        offers: {
          '@type': 'Offer',
          url: `${SITE_URL}/products/${product.slug}`,
          priceCurrency: product.currency,
          price: product.basePrice,
          availability: product.inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        },
        ...(product.reviewSummary.count > 0 && {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.reviewSummary.rating,
            reviewCount: product.reviewSummary.count,
          },
        }),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Products', item: `${SITE_URL}/products` },
          {
            '@type': 'ListItem',
            position: 3,
            name: product.category.name,
            item: `${SITE_URL}/products?category=${product.category.slug}`,
          },
          { '@type': 'ListItem', position: 4, name: product.name },
        ],
      },
    ],
  };
}
