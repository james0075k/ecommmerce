import { z } from 'zod';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants.js';

/* -------------------------------------------------------------------------- */
/*  Primitives reused across every schema                                     */
/* -------------------------------------------------------------------------- */

export const uuidSchema = z.string().uuid('Must be a valid UUID');

export const slugSchema = z
  .string()
  .min(1, 'Slug is required')
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug may contain lowercase letters, numbers and hyphens');

/** Nepali mobile numbers (98xxxxxxxx / 97xxxxxxxx) or E.164 international. */
export const phoneSchema = z
  .string()
  .regex(/^(\+977[-\s]?)?9[678]\d{8}$|^\+[1-9]\d{7,14}$/, 'Enter a valid phone number');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

/** D1: Argon2id hashing happens server-side; this only enforces entropy at the edge. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/\d/, 'Must include a number');

export const priceSchema = z
  .number()
  .nonnegative('Price cannot be negative')
  .max(99_999_999, 'Price is unrealistically large');

export const urlSchema = z.string().url('Must be a valid URL');

/** Free-form JSONB payloads (product attributes, gateway responses, settings). */
export const jsonSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ]),
);

/* -------------------------------------------------------------------------- */
/*  Pagination                                                                */
/* -------------------------------------------------------------------------- */

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '"from" must be on or before "to"',
    path: ['from'],
  });

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

/* -------------------------------------------------------------------------- */
/*  SEO fields shared by products and categories                              */
/* -------------------------------------------------------------------------- */

export const seoSchema = z.object({
  metaTitle: z.string().max(70, 'Keep meta titles under 70 characters').optional().nullable(),
  metaDescription: z
    .string()
    .max(160, 'Keep meta descriptions under 160 characters')
    .optional()
    .nullable(),
});

export type SeoInput = z.infer<typeof seoSchema>;
