import { z } from 'zod';

import { Currency, OrderStatus, PaymentMethod, PaymentStatus, RefundStatus } from '../enums.js';
import { CARRIER_IDS, SHIPPING_METHOD_IDS } from '../constants.js';
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

/**
 * Payload for POST /orders/checkout.
 *
 * D2: no money crosses this boundary. The client sends *what* to buy and
 * *where* to send it; every figure on the resulting order - line prices,
 * shipping, tax, discount, total - is recomputed from the database. A client
 * that submits a price is submitting something the server ignores.
 */
export const checkoutInputSchema = z
  .object({
    shippingAddressId: uuidSchema.optional(),
    shippingAddress: addressInputSchema.optional(),
    billingAddressId: uuidSchema.optional(),
    billingAddress: addressInputSchema.optional(),
    guestEmail: z.string().email('Enter a valid email address').optional(),
    paymentMethod: z.nativeEnum(PaymentMethod),
    shippingMethod: z.enum(SHIPPING_METHOD_IDS).default('STANDARD'),
    couponCode: z.string().max(40).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((value) => value.shippingAddressId || value.shippingAddress, {
    message: 'Choose a saved address or enter a new one',
    path: ['shippingAddress'],
  });

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

/** Payload for POST /orders/:id/cancel. */
export const cancelOrderSchema = z.object({
  reason: z.string().min(3, 'Tell us why you are cancelling').max(500),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

/** Query for the shipping-rate quote shown in checkout step 2. */
export const shippingQuoteSchema = z.object({
  district: z.string().min(2).max(60),
});

export type ShippingQuoteInput = z.infer<typeof shippingQuoteSchema>;

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

/* -------------------------------------------------------------------------- */
/*  Admin order management (Phase 6)                                          */
/* -------------------------------------------------------------------------- */

/** Query for GET /admin/orders - the shopper's own list uses `orderQuerySchema`. */
export const adminOrderQuerySchema = orderQuerySchema.extend({
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  userId: uuidSchema.optional(),
  /** Orders whose tracking number is still blank - the "to dispatch" worklist. */
  awaitingShipment: z.coerce.boolean().optional(),
  sort: z.enum(['newest', 'oldest', 'total_high', 'total_low']).default('newest'),
});

export type AdminOrderQueryInput = z.infer<typeof adminOrderQuerySchema>;

/**
 * Payload for POST /admin/orders/:id/shipping.
 *
 * Carrier is validated against the known list rather than left free text: the
 * tracking link the shopper is shown is built by looking the carrier up, and an
 * unrecognised one would silently degrade to an unlinked number.
 */
export const orderShippingSchema = z.object({
  trackingNumber: z.string().min(3, 'Enter the consignment number').max(120),
  carrier: z.enum(CARRIER_IDS),
  note: z.string().max(500).optional(),
  /** False to record the consignment without moving the order to SHIPPED. */
  markShipped: z.boolean().default(true),
});

export type OrderShippingInput = z.infer<typeof orderShippingSchema>;

/**
 * Payload for POST /admin/orders/:id/refund.
 *
 * `amount` is optional and defaults to the full captured amount server-side -
 * a client that omits it gets the whole order back, and one that sends more
 * than was captured is rejected there, not here (only the server knows the
 * figure).
 */
export const adminRefundSchema = z.object({
  amount: priceSchema.positive('A refund must be for more than zero').optional(),
  reason: z.string().min(3, 'A refund reason is required').max(500),
  /** Put the items back in stock. Off for a goodwill refund on a kept order. */
  restock: z.boolean().default(false),
});

export type AdminRefundInput = z.infer<typeof adminRefundSchema>;

/** Payload for PATCH /admin/orders/bulk-status. */
export const bulkOrderStatusSchema = z.object({
  orderIds: z.array(uuidSchema).min(1, 'Select at least one order').max(100),
  status: z.nativeEnum(OrderStatus),
  note: z.string().max(500).optional(),
});

export type BulkOrderStatusInput = z.infer<typeof bulkOrderStatusSchema>;
