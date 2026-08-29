import { z } from 'zod';

import { ContactStatus, CouponType, NotificationType } from '../enums.js';
import {
  jsonSchema,
  paginationSchema,
  phoneSchema,
  priceSchema,
  urlSchema,
  uuidSchema,
} from './common.js';

/* -------------------------------------------------------------------------- */
/*  Cart (C1.4) - server-side, persists across devices                        */
/* -------------------------------------------------------------------------- */

export const cartItemSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema.nullable(),
  /** Guests are tracked by session id until they log in and carts are merged. */
  sessionId: z.string().max(120).nullable(),
  productId: uuidSchema,
  variantId: uuidSchema,
  quantity: z.number().int().positive().max(999),
  addedAt: z.coerce.date(),
});

export type CartItem = z.infer<typeof cartItemSchema>;

export const addToCartSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema,
  quantity: z.number().int().positive().max(99).default(1),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(99),
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

/* -------------------------------------------------------------------------- */
/*  Wishlist (C1.4)                                                           */
/* -------------------------------------------------------------------------- */

export const wishlistItemSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.nullable(),
  /** Enables price-drop alerts (G2). */
  priceAtAdd: priceSchema,
  addedAt: z.coerce.date(),
});

export type WishlistItem = z.infer<typeof wishlistItemSchema>;

export const addToWishlistSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.optional().nullable(),
});

export type AddToWishlistInput = z.infer<typeof addToWishlistSchema>;

/* -------------------------------------------------------------------------- */
/*  Reviews (C1.4) - verified purchasers only (D2)                            */
/* -------------------------------------------------------------------------- */

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1, 'Pick a rating').max(5),
  title: z.string().max(120).optional().nullable(),
  body: z.string().min(10, 'Review must be at least 10 characters').max(5000),
  images: z.array(urlSchema).max(5, 'At most 5 images').default([]),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const reviewSchema = reviewInputSchema.extend({
  id: uuidSchema,
  productId: uuidSchema,
  userId: uuidSchema.nullable(),
  isVerifiedPurchase: z.boolean(),
  isApproved: z.boolean(),
  helpfulCount: z.number().int().min(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Review = z.infer<typeof reviewSchema>;

export const reviewQuerySchema = paginationSchema.extend({
  sort: z.enum(['newest', 'helpful', 'rating_desc', 'rating_asc']).default('newest'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export type ReviewQueryInput = z.infer<typeof reviewQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Coupons (C1.4)                                                            */
/* -------------------------------------------------------------------------- */

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .min(3, 'Code must be at least 3 characters')
      .max(40)
      .regex(/^[A-Z0-9_-]+$/, 'Use uppercase letters, numbers, hyphens and underscores'),
    type: z.nativeEnum(CouponType),
    value: z.number().nonnegative(),
    minOrderAmount: priceSchema.optional().nullable(),
    maxDiscountAmount: priceSchema.optional().nullable(),
    usageLimit: z.number().int().positive().optional().nullable(),
    perUserLimit: z.number().int().positive().optional().nullable(),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date(),
    applicableCategories: z.array(uuidSchema).default([]),
    applicableProducts: z.array(uuidSchema).default([]),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.validUntil > v.validFrom, {
    message: '"Valid until" must be after "valid from"',
    path: ['validUntil'],
  })
  .refine((v) => v.type !== CouponType.PERCENTAGE || v.value <= 100, {
    message: 'A percentage discount cannot exceed 100',
    path: ['value'],
  });

export type CouponInput = z.infer<typeof couponInputSchema>;

export const couponSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  type: z.nativeEnum(CouponType),
  value: z.number(),
  minOrderAmount: priceSchema.nullable(),
  maxDiscountAmount: priceSchema.nullable(),
  usageLimit: z.number().int().nullable(),
  usedCount: z.number().int().min(0),
  perUserLimit: z.number().int().nullable(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
  applicableCategories: z.array(uuidSchema),
  applicableProducts: z.array(uuidSchema),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Coupon = z.infer<typeof couponSchema>;

export const applyCouponSchema = z.object({
  code: z.string().min(3).max(40),
});

export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;

/* -------------------------------------------------------------------------- */
/*  Notifications (C1.5)                                                      */
/* -------------------------------------------------------------------------- */

export const notificationSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  type: z.nativeEnum(NotificationType),
  title: z.string().max(160),
  body: z.string().max(1000),
  data: z.record(jsonSchema).nullable(),
  isRead: z.boolean(),
  createdAt: z.coerce.date(),
});

export type Notification = z.infer<typeof notificationSchema>;

/* -------------------------------------------------------------------------- */
/*  Contact messages (C1.5)                                                   */
/* -------------------------------------------------------------------------- */

export const contactMessageInputSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  email: z.string().email('Enter a valid email address'),
  phone: phoneSchema.optional().nullable(),
  subject: z.string().min(3, 'Subject is required').max(200),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000),
});

export type ContactMessageInput = z.infer<typeof contactMessageInputSchema>;

export const contactMessageSchema = contactMessageInputSchema.extend({
  id: uuidSchema,
  status: z.nativeEnum(ContactStatus),
  repliedAt: z.coerce.date().nullable(),
  repliedBy: uuidSchema.nullable(),
  createdAt: z.coerce.date(),
});

export type ContactMessage = z.infer<typeof contactMessageSchema>;
