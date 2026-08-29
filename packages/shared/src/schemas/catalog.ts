import { z } from 'zod';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PRODUCT_SORT_VALUES } from '../constants.js';
import { Currency, ProductStatus } from '../enums.js';
import { jsonSchema, priceSchema, slugSchema, urlSchema, uuidSchema } from './common.js';

/* -------------------------------------------------------------------------- */
/*  Admin: product create / update                                            */
/* -------------------------------------------------------------------------- */

/**
 * Admin product payload. Kept separate from `productInputSchema` because the
 * admin form submits images and variants alongside the product in one request,
 * and every field is optional on PATCH.
 */
export const adminProductSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(64),
  name: z.string().min(2, 'Product name is required').max(200),
  slug: slugSchema,
  description: z.string().max(50_000).optional().nullable(),
  shortDescription: z.string().max(500).optional().nullable(),
  basePrice: priceSchema,
  compareAtPrice: priceSchema.optional().nullable(),
  costPrice: priceSchema.optional().nullable(),
  currency: z.nativeEnum(Currency).default(Currency.NPR),
  categoryId: uuidSchema,
  brand: z.string().max(80).optional().nullable(),
  tags: z.array(z.string().max(40)).max(30).default([]),
  attributes: z.record(jsonSchema).default({}),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.DRAFT),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isDigital: z.boolean().default(false),
  weight: z.number().nonnegative().optional().nullable(),
  metaTitle: z.string().max(70).optional().nullable(),
  metaDescription: z.string().max(160).optional().nullable(),

  images: z
    .array(
      z.object({
        url: urlSchema,
        altText: z.string().max(200).optional().nullable(),
        isPrimary: z.boolean().default(false),
        sortOrder: z.number().int().min(0).default(0),
        width: z.number().int().positive().optional().nullable(),
        height: z.number().int().positive().optional().nullable(),
        blurhash: z.string().max(64).optional().nullable(),
      }),
    )
    .max(12, 'At most 12 images per product')
    .default([]),

  variants: z
    .array(
      z.object({
        id: uuidSchema.optional(),
        sku: z.string().min(1).max(64),
        name: z.string().min(1).max(120),
        priceOverride: priceSchema.optional().nullable(),
        stockQuantity: z.number().int().min(0).default(0),
        attributes: z.record(z.string()).default({}),
        isActive: z.boolean().default(true),
      }),
    )
    .max(200, 'At most 200 variants per product')
    .default([]),
});

export type AdminProductInput = z.infer<typeof adminProductSchema>;

export const adminProductUpdateSchema = adminProductSchema.partial();
export type AdminProductUpdateInput = z.infer<typeof adminProductUpdateSchema>;

/* -------------------------------------------------------------------------- */
/*  Admin: variants                                                           */
/* -------------------------------------------------------------------------- */

export const variantInputSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(64),
  name: z.string().min(1, 'Variant name is required').max(120),
  priceOverride: priceSchema.optional().nullable(),
  stockQuantity: z.number().int().min(0).default(0),
  attributes: z.record(z.string()).default({}),
  isActive: z.boolean().default(true),
});

export type VariantInput = z.infer<typeof variantInputSchema>;
export const variantUpdateSchema = variantInputSchema.partial();
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;

/** Adjusts stock by a delta rather than setting it, so concurrent edits do not clobber. */
export const stockAdjustmentSchema = z.object({
  delta: z.number().int(),
  reason: z.string().max(200).optional(),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

/* -------------------------------------------------------------------------- */
/*  Image upload                                                              */
/* -------------------------------------------------------------------------- */

export const imageUploadRequestSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
});

export type ImageUploadRequest = z.infer<typeof imageUploadRequestSchema>;

export const attachImageSchema = z.object({
  url: urlSchema,
  altText: z.string().max(200).optional().nullable(),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export type AttachImageInput = z.infer<typeof attachImageSchema>;

/* -------------------------------------------------------------------------- */
/*  Bulk CSV import                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One CSV row. Everything arrives as a string, so numbers and booleans are
 * coerced and `tags` is split on a pipe (commas appear inside tag text).
 */
export const bulkImportRowSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(64),
  name: z.string().min(2, 'Name is required').max(200),
  slug: slugSchema.optional(),
  description: z.string().max(50_000).optional(),
  shortDescription: z.string().max(500).optional(),
  basePrice: z.coerce.number().nonnegative('Price cannot be negative'),
  compareAtPrice: z.coerce.number().nonnegative().optional(),
  categorySlug: z.string().min(1, 'categorySlug is required'),
  brand: z.string().max(80).optional(),
  tags: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split('|')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    ),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  imageUrl: z.string().url().optional().or(z.literal('')),
  isActive: z
    .string()
    .optional()
    .transform((value) => value?.toLowerCase() !== 'false'),
});

export type BulkImportRow = z.infer<typeof bulkImportRowSchema>;

export interface BulkImportRowError {
  row: number;
  sku?: string;
  errors: Array<{ field: string; message: string }>;
}

export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: BulkImportRowError[];
}

/* -------------------------------------------------------------------------- */
/*  Search                                                                    */
/* -------------------------------------------------------------------------- */

export const searchQuerySchema = z.object({
  q: z.string().max(160).default(''),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  category: z.string().max(120).optional(),
  brand: z.string().max(80).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: z.enum(PRODUCT_SORT_VALUES).optional(),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

/** Shape returned by GET /products and GET /search alike. */
export interface CatalogFacets {
  categories: Array<{ value: string; label: string; count: number }>;
  brands: Array<{ value: string; count: number }>;
  priceRange: { min: number; max: number };
}

/* -------------------------------------------------------------------------- */
/*  Category tree                                                             */
/* -------------------------------------------------------------------------- */

export const categoryUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional().nullable(),
  imageUrl: urlSchema.optional().nullable(),
  parentId: uuidSchema.optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  metaTitle: z.string().max(70).optional().nullable(),
  metaDescription: z.string().max(160).optional().nullable(),
});

export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
