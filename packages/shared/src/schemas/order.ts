import { z } from 'zod';

import { Currency, OrderStatus, PaymentMethod, PaymentStatus, RefundStatus } from '../enums.js';
import { jsonSchema, paginationSchema, priceSchema, uuidSchema } from './common.js';
import { addressInputSchema } from './user.js';

/* -------------------------------------------------------------------------- */
/*  Order item (C1.3) - snapshots product state at purchase time              */
/* -------------------------------------------------------------------------- */

export const orderItemSchema = z.object({
  id: uuidSchema,
  orderId: uuidSchema,
  productId: uuidSchema.nullable(),
  variantId: uuidSchema.nullable(),
  productName: z.string(),
  variantName: z.string().nullable(),
  sku: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: priceSchema,
  totalPrice: priceSchema,
  /** D2 integrity: immutable snapshot so later product edits never rewrite history. */
  productSnapshot: z.record(jsonSchema),
});

export type OrderItem = z.infer<typeof orderItemSchema>;

/* -------------------------------------------------------------------------- */
/*  Order (C1.3)                                                              */
/* -------------------------------------------------------------------------- */

export const orderSchema = z.object({
  id: uuidSchema,
  /** Human-readable: ORD-20270815-XXXX */
  orderNumber: z.string().regex(/^ORD-\d{8}-[A-Z0-9]{4,8}$/, 'Malformed order number'),
  userId: uuidSchema.nullable(),
  guestEmail: z.string().email().nullable(),
  status: z.nativeEnum(OrderStatus),
  subtotal: priceSchema,
  discountAmount: priceSchema,
  shippingCost: priceSchema,
  taxAmount: priceSchema,
  total: priceSchema,
  currency: z.nativeEnum(Currency),
  /** Address snapshots - the user may edit their address book later. */
  shippingAddress: z.record(jsonSchema),
  billingAddress: z.record(jsonSchema).nullable(),
  notes: z.string().max(1000).nullable(),
  cancelledReason: z.string().max(500).nullable(),
  trackingNumber: z.string().max(120).nullable(),
  carrier: z.string().max(80).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Order = z.infer<typeof orderSchema>;

/** Payload for POST /orders/checkout. Totals are always recomputed server-side (D2). */
export const checkoutInputSchema = z.object({
  shippingAddressId: uuidSchema.optional(),
  shippingAddress: addressInputSchema.optional(),
  billingAddressId: uuidSchema.optional(),
  billingAddress: addressInputSchema.optional(),
  guestEmail: z.string().email().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  couponCode: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  note: z.string().max(500).optional(),
  trackingNumber: z.string().max(120).optional(),
  carrier: z.string().max(80).optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const orderQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(OrderStatus).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().max(120).optional(),
});

export type OrderQueryInput = z.infer<typeof orderQuerySchema>;

export const orderStatusHistorySchema = z.object({
  id: uuidSchema,
  orderId: uuidSchema,
  status: z.nativeEnum(OrderStatus),
  changedBy: uuidSchema.nullable(),
  note: z.string().max(500).nullable(),
  createdAt: z.coerce.date(),
});

export type OrderStatusHistory = z.infer<typeof orderStatusHistorySchema>;

/* -------------------------------------------------------------------------- */
/*  Payments & refunds (C1.3)                                                 */
/* -------------------------------------------------------------------------- */

export const paymentSchema = z.object({
  id: uuidSchema,
  orderId: uuidSchema,
  method: z.nativeEnum(PaymentMethod),
  status: z.nativeEnum(PaymentStatus),
  amount: priceSchema,
  currency: z.nativeEnum(Currency),
  transactionId: z.string().max(200).nullable(),
  /** Raw gateway payload, kept for reconciliation and dispute handling. */
  gatewayResponse: z.record(jsonSchema).nullable(),
  paidAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Payment = z.infer<typeof paymentSchema>;

export const refundSchema = z.object({
  id: uuidSchema,
  paymentId: uuidSchema,
  amount: priceSchema,
  reason: z.string().max(500),
  status: z.nativeEnum(RefundStatus),
  gatewayRefundId: z.string().max(200).nullable(),
  processedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});

export type Refund = z.infer<typeof refundSchema>;

export const createRefundSchema = z.object({
  paymentId: uuidSchema,
  amount: priceSchema.optional(),
  reason: z.string().min(3, 'A refund reason is required').max(500),
});

export type CreateRefundInput = z.infer<typeof createRefundSchema>;
