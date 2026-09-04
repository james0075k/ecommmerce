/**
 * Cart, coupon and wishlist transport contracts (C1.4).
 *
 * D2: "money is always calculated server-side". Every figure below is computed
 * by the API and rendered verbatim by the client - the drawer never recomputes
 * a subtotal from unit prices, because the two would drift the moment a rule
 * (a per-line cap, a category-scoped coupon) changes on one side only.
 */

import type { CouponType } from '../enums.js';

export type SupportedCurrency = 'NPR' | 'USD';

export interface CartLineProduct {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  currency: SupportedCurrency;
  image: { url: string; altText: string | null; blurhash: string | null } | null;
}

export interface CartLineVariant {
  id: string;
  sku: string;
  name: string;
  /** e.g. `{ "Color": "Midnight", "Size": "M" }` - rendered under the name. */
  attributes: Record<string, string>;
}

export interface CartLine {
  id: string;
  quantity: number;
  addedAt: string;
  product: CartLineProduct;
  variant: CartLineVariant;
  unitPrice: number;
  lineTotal: number;
  compareAtPrice: number | null;

  /* --- Stock validation, re-checked on every cart read -------------------- */

  /** Units the warehouse can actually ship right now. */
  availableQuantity: number;
  /** `availableQuantity === 0`, or the variant was deactivated/deleted. */
  isOutOfStock: boolean;
  /** Stock dropped below the saved quantity but some units remain. */
  isPartiallyAvailable: boolean;
  /** Ceiling the quantity stepper enforces: `min(available, CART_MAX_QUANTITY)`. */
  maxQuantity: number;
}

export interface AppliedCoupon {
  code: string;
  type: CouponType;
  /** Percent for PERCENTAGE, an amount for FIXED, 0 for FREE_SHIPPING. */
  value: number;
  /** The money actually taken off this cart, after any max-discount cap. */
  discountAmount: number;
  /** True when the coupon covers only part of the cart (category/product scoped). */
  isPartial: boolean;
  /** Human-readable: "20% off electronics", "Free shipping". */
  description: string;
}

export interface CartSummary {
  currency: SupportedCurrency;
  /** Sum of every line total, before any discount. */
  subtotal: number;
  discount: number;
  /** Estimate only - the real rate is computed at checkout from the district. */
  shipping: number;
  /** True when the subtotal cleared FREE_SHIPPING_THRESHOLD or a coupon paid for it. */
  isFreeShipping: boolean;
  total: number;
  /** Total units, not lines - this is the navbar badge. */
  itemCount: number;
  /** How much more to spend to earn free shipping; 0 once it is earned. */
  freeShippingRemaining: number;
}

/** A problem the shopper has to see before checkout can proceed. */
export interface CartIssue {
  cartItemId: string;
  code: 'OUT_OF_STOCK' | 'QUANTITY_REDUCED' | 'UNAVAILABLE';
  message: string;
}

export interface CartView {
  items: CartLine[];
  summary: CartSummary;
  coupon: AppliedCoupon | null;
  issues: CartIssue[];
  /** False while any line is out of stock - the checkout button reads this. */
  isCheckoutReady: boolean;
}

/** Returned by POST /cart/apply-coupon on success. */
export interface CouponValidationResult {
  coupon: AppliedCoupon;
  summary: CartSummary;
}

/* -------------------------------------------------------------------------- */
/*  Wishlist                                                                   */
/* -------------------------------------------------------------------------- */

export interface WishlistEntry {
  id: string;
  addedAt: string;
  product: CartLineProduct & {
    rating: number;
    reviewCount: number;
    compareAtPrice: number | null;
  };
  variant: CartLineVariant | null;
  /** The price when it was saved - the baseline for the price-drop badge. */
  priceAtAdd: number;
  currentPrice: number;
  /** Positive when the price fell; the badge shows this as a percentage. */
  priceDropAmount: number;
  priceDropPercent: number;
  inStock: boolean;
  stockQuantity: number;
}

export interface WishlistView {
  items: WishlistEntry[];
  /** Null until the shopper generates a link. */
  shareUrl: string | null;
}

/** The read-only view behind a share link - no ids that could be acted on. */
export interface SharedWishlistView {
  ownerName: string;
  items: WishlistEntry[];
}
