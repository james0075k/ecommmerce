/**
 * Checkout, payment-initialisation and order-view contracts (C1.3, F1.6).
 *
 * The shape that matters most here is `PaymentInit`: a discriminated union over
 * `kind`, because the eight gateways divide into exactly three client
 * behaviours - post a form, follow a redirect, or drive an embedded SDK - and
 * the checkout page should switch on that, not on the payment method. Adding a
 * ninth gateway that redirects then needs no frontend change at all.
 */

import type {
  Currency,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
} from '../enums.js';
import type { ShippingMethodId, ShippingZone } from '../constants.js';
import type { SupportedCurrency } from './cart.js';

/* -------------------------------------------------------------------------- */
/*  Shipping                                                                  */
/* -------------------------------------------------------------------------- */

export interface ShippingQuote {
  method: ShippingMethodId;
  label: string;
  description: string;
  zone: ShippingZone;
  /** What this method costs for this cart, after any free-shipping rule. */
  cost: number;
  /** The undiscounted rate, so "Free" can be shown with the price struck out. */
  baseCost: number;
  isFree: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  /** ISO date - what the confirmation page shows as "arriving by". */
  estimatedDeliveryDate: string;
}

/* -------------------------------------------------------------------------- */
/*  Payment initialisation                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Auto-submitting HTML form post (eSewa). The gateway requires specific field
 * names in a specific order, so the server builds the whole field set.
 */
export interface PaymentInitFormPost {
  kind: 'form_post';
  method: PaymentMethod;
  actionUrl: string;
  fields: Record<string, string>;
}

/** Plain browser redirect (Khalti, PayPal, ConnectIPS, IME Pay). */
export interface PaymentInitRedirect {
  kind: 'redirect';
  method: PaymentMethod;
  redirectUrl: string;
}

/** Client-side SDK takes over (Stripe Elements). */
export interface PaymentInitClientSdk {
  kind: 'client_sdk';
  method: PaymentMethod;
  clientSecret: string;
  publishableKey: string | null;
  /**
   * Our `payments` row id. The SDK's return URL has to carry it so the callback
   * knows which payment settled - Stripe's own intent id identifies the intent,
   * not our record of it.
   */
  paymentId: string;
}

/** A QR the shopper scans in their banking app (Fonepay). */
export interface PaymentInitQr {
  kind: 'qr';
  method: PaymentMethod;
  /** Data URI of the QR image. */
  qrImage: string;
  /** The raw payload, for a "copy code" fallback. */
  qrPayload: string;
  /** Poll this to learn when the scan completed. */
  statusUrl: string;
  expiresAt: string;
}

/** Nothing to pay now (Cash on Delivery). */
export interface PaymentInitNone {
  kind: 'none';
  method: PaymentMethod;
  message: string;
}

export type PaymentInit =
  | PaymentInitFormPost
  | PaymentInitRedirect
  | PaymentInitClientSdk
  | PaymentInitQr
  | PaymentInitNone;

/* -------------------------------------------------------------------------- */
/*  Orders                                                                    */
/* -------------------------------------------------------------------------- */

export interface OrderItemView {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** Read from the immutable snapshot, so it survives product deletion. */
  imageUrl: string | null;
  slug: string | null;
}

export interface OrderAddressView {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  district: string;
  province: string;
  postalCode: string | null;
  country: string;
}

export interface OrderPaymentView {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  transactionId: string | null;
  paidAt: string | null;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: Currency;

  subtotal: number;
  discountAmount: number;
  shippingCost: number;
  taxAmount: number;
  total: number;

  items: OrderItemView[];
  shippingAddress: OrderAddressView;
  billingAddress: OrderAddressView | null;

  shippingMethod: ShippingMethodId;
  estimatedDeliveryDate: string | null;
  trackingNumber: string | null;
  carrier: string | null;

  payment: OrderPaymentView | null;
  notes: string | null;
  cancelledReason: string | null;

  placedAt: string | null;
  createdAt: string;

  /** Server's verdict, so the UI never re-derives the cancellation rule. */
  isCancellable: boolean;
}

/** What POST /orders/checkout returns. */
export interface CheckoutResult {
  order: OrderView;
  payment: PaymentInit;
}

/* -------------------------------------------------------------------------- */
/*  Payment method presentation                                               */
/* -------------------------------------------------------------------------- */

export interface PaymentMethodOption {
  method: PaymentMethod;
  label: string;
  /** One line under the label in the radio list. */
  description: string;
  /** False when the server has no credentials for it - shown disabled. */
  isAvailable: boolean;
  /** Which currencies this gateway can actually settle. */
  currencies: SupportedCurrency[];
}

/* -------------------------------------------------------------------------- */
/*  Order detail, timeline and admin views (Phase 6)                          */
/* -------------------------------------------------------------------------- */

/** One row of `order_status_history`, oldest first, as the timeline renders it. */
export interface OrderTimelineEntry {
  id: string;
  status: OrderStatus;
  note: string | null;
  /** The admin who made the change, when a person did. Null for automation. */
  changedByName: string | null;
  createdAt: string;
}

export interface OrderRefundView {
  id: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  processedAt: string | null;
  createdAt: string;
}

/**
 * What GET /orders/:id returns: everything `OrderView` has, plus the history
 * the timeline animates through and any refunds raised against it.
 *
 * The tracking *link* is resolved server-side rather than in the browser so
 * that adding a courier does not need a frontend deploy.
 */
export interface OrderDetail extends OrderView {
  timeline: OrderTimelineEntry[];
  refunds: OrderRefundView[];
  carrierLabel: string | null;
  trackingUrl: string | null;
  deliveredAt: string | null;
  /** Total already refunded, so the UI can show a partial refund honestly. */
  refundedAmount: number;
}

/** A row in the shopper's order list - the summary, without the full items. */
export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: Currency;
  total: number;
  itemCount: number;
  /** Up to three thumbnails for the collapsed row. */
  thumbnails: string[];
  /** The full lines, for the quick-view expansion - already paid for by the
   *  list query, so expanding costs no extra request. */
  items: OrderItemView[];
  trackingNumber: string | null;
  carrierLabel: string | null;
  trackingUrl: string | null;
  placedAt: string | null;
  createdAt: string;
  isCancellable: boolean;
}

/** A row in the admin data table. */
export interface AdminOrderListItem extends OrderListItem {
  customerName: string;
  customerEmail: string;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  itemsTotal: number;
  district: string;
}

/** The Socket.IO payload broadcast into an order's room. */
export interface OrderUpdatedEvent {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  note: string | null;
  trackingNumber: string | null;
  carrierLabel: string | null;
  trackingUrl: string | null;
  paymentStatus: PaymentStatus | null;
  at: string;
}
