import type { CatalogFacets, PaginationMeta } from '@bazaar/shared';

/** Shared catalog types the listing, search and detail pages all read. */

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: 'NPR' | 'USD';
  brand: string | null;
  tags: string[];
  isFeatured: boolean;
  category: { id: string; name: string; slug: string };
  image: { url: string; altText: string | null; blurhash: string | null } | null;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  stockQuantity: number;
}

export interface ProductListResponse {
  items: ProductListItem[];
  meta: PaginationMeta;
  facets: CatalogFacets;
  engine?: 'meilisearch' | 'postgres';
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
  children: CategoryNode[];
}

export interface ProductVariantDetail {
  id: string;
  sku: string;
  name: string;
  price: number;
  priceOverride: number | null;
  stockQuantity: number;
  attributes: Record<string, string>;
  isActive: boolean;
}

export interface ProductImageDetail {
  id: string;
  url: string;
  altText: string | null;
  blurhash: string | null;
  isPrimary: boolean;
  sortOrder: number;
  width: number | null;
  height: number | null;
}

export interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  currency: 'NPR' | 'USD';
  brand: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  isFeatured: boolean;
  weight: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  category: { id: string; name: string; slug: string; parentId: string | null };
  images: ProductImageDetail[];
  variants: ProductVariantDetail[];
  reviewSummary: {
    rating: number;
    count: number;
    distribution: Array<{ rating: number; count: number }>;
  };
  inStock: boolean;
  stockQuantity: number;
  related: ProductListItem[];
}

/** Percentage off, rounded — only meaningful when compareAtPrice is higher. */
export function discountPercent(price: number, compareAtPrice: number | null): number | null {
  if (!compareAtPrice || compareAtPrice <= price) return null;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

/**
 * The option name → values map for a product's variants, derived from the
 * variants themselves so the selector always matches what actually exists.
 */
export function deriveOptions(
  variants: ProductVariantDetail[],
): Record<string, string[]> {
  const options: Record<string, string[]> = {};

  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.attributes)) {
      const values = (options[name] ??= []);
      if (!values.includes(value)) values.push(value);
    }
  }

  return options;
}

/** Finds the variant matching every selected option, if one exists. */
export function matchVariant(
  variants: ProductVariantDetail[],
  selection: Record<string, string>,
): ProductVariantDetail | undefined {
  const names = Object.keys(selection);
  if (names.length === 0) return variants[0];

  return variants.find((variant) =>
    names.every((name) => variant.attributes[name] === selection[name]),
  );
}
