import { z } from 'zod';

import { PRODUCT_SORT_VALUES } from '../constants.js';
import { Currency, ProductStatus } from '../enums.js';
import {
  jsonSchema,
  paginationSchema,
  priceSchema,
  seoSchema,
  slugSchema,
  urlSchema,
  uuidSchema,
} from './common.js';

/* -------------------------------------------------------------------------- */
/*  Category (C1.2) - hierarchical: Electronics > Phones > Smartphones        */
/* -------------------------------------------------------------------------- */

export const categoryInputSchema = seoSchema.extend({
  name: z.string().min(2, 'Category name is required').max(80),
  slug: slugSchema,
  description: z.string().max(2000).optional().nullable(),
  imageUrl: urlSchema.optional().nullable(),
  parentId: uuidSchema.optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categorySchema = categoryInputSchema.extend({
  id: uuidSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Category = z.infer<typeof categorySchema>;

/** Category tree node returned by GET /categories. */
export type CategoryTreeNode = Category & { children: CategoryTreeNode[] };

/* -------------------------------------------------------------------------- */
/*  Product images & videos (C1.2)                                            */
/* -------------------------------------------------------------------------- */

export const productImageSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema,
  url: urlSchema,
  altText: z.string().max(200).nullable(),
  sortOrder: z.number().int().min(0),
  isPrimary: z.boolean(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  /** Blurhash string for instant blur-up placeholders (A1.1). */
  blurhash: z.string().max(64).nullable(),
});

export type ProductImage = z.infer<typeof productImageSchema>;

export const productVideoSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema,
  url: urlSchema,
  thumbnailUrl: urlSchema.nullable(),
  durationSeconds: z.number().int().positive().nullable(),
  sortOrder: z.number().int().min(0),
});

export type ProductVideo = z.infer<typeof productVideoSchema>;

/* -------------------------------------------------------------------------- */
/*  Product variant (C1.2)                                                    */
/* -------------------------------------------------------------------------- */

export const productVariantInputSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(64),
  name: z.string().min(1, 'Variant name is required').max(120),
  priceOverride: priceSchema.optional().nullable(),
  stockQuantity: z.number().int().min(0, 'Stock cannot be negative').default(0),
  attributes: z.record(z.string()).default({}),
  imageIds: z.array(uuidSchema).default([]),
  isActive: z.boolean().default(true),
});

export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

export const productVariantSchema = productVariantInputSchema.extend({
  id: uuidSchema,
  productId: uuidSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ProductVariant = z.infer<typeof productVariantSchema>;

/* -------------------------------------------------------------------------- */
/*  Product (C1.2)                                                            */
/* -------------------------------------------------------------------------- */

export const productInputSchema = seoSchema
  .extend({
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
    /** Flexible JSONB attributes: { "color": "Red", "size": "XL" }. */
    attributes: z.record(jsonSchema).default({}),
    status: z.nativeEnum(ProductStatus).default(ProductStatus.DRAFT),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    isDigital: z.boolean().default(false),
    weight: z.number().nonnegative().optional().nullable(),
    dimensions: z
      .object({
        length: z.number().nonnegative(),
        width: z.number().nonnegative(),
        height: z.number().nonnegative(),
        unit: z.enum(['cm', 'in']).default('cm'),
      })
      .optional()
      .nullable(),
  })
  .refine((v) => v.compareAtPrice == null || v.compareAtPrice > v.basePrice, {
    message: 'Compare-at price must be higher than the base price',
    path: ['compareAtPrice'],
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export const productSchema = z.object({
  id: uuidSchema,
  sku: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  shortDescription: z.string().nullable(),
  basePrice: priceSchema,
  compareAtPrice: priceSchema.nullable(),
  currency: z.nativeEnum(Currency),
  categoryId: uuidSchema,
  brand: z.string().nullable(),
  tags: z.array(z.string()),
  attributes: z.record(jsonSchema),
  status: z.nativeEnum(ProductStatus),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  isDigital: z.boolean(),
  weight: z.number().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Product = z.infer<typeof productSchema>;

/* -------------------------------------------------------------------------- */
/*  Inventory (C1.2)                                                          */
/* -------------------------------------------------------------------------- */

export const inventorySchema = z.object({
  id: uuidSchema,
  variantId: uuidSchema,
  warehouseId: z.string().max(64).nullable(),
  quantity: z.number().int().min(0),
  reservedQuantity: z.number().int().min(0),
  reorderLevel: z.number().int().min(0),
  reorderQuantity: z.number().int().min(0),
  updatedAt: z.coerce.date(),
});

export type Inventory = z.infer<typeof inventorySchema>;

/* -------------------------------------------------------------------------- */
/*  Listing query (G1: all filters URL-synced and shareable)                  */
/* -------------------------------------------------------------------------- */

export const productQuerySchema = paginationSchema.extend({
  sort: z.enum(PRODUCT_SORT_VALUES).default('newest'),
  category: slugSchema.optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  brand: z.string().max(80).optional(),
  rating: z.coerce.number().min(1).max(5).optional(),
  inStock: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  search: z.string().max(120).optional(),
});

export type ProductQueryInput = z.infer<typeof productQuerySchema>;
