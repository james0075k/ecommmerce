/**
 * Bazaar domain enums.
 *
 * Declared as `const` objects + derived union types so a single declaration works
 * at runtime (dropdown options, validation) and at the type level. These mirror the
 * native Postgres enums in prisma/schema.prisma exactly - keep them in sync.
 */

export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AccountStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const OAuthProvider = {
  GOOGLE: 'GOOGLE',
  FACEBOOK: 'FACEBOOK',
  APPLE: 'APPLE',
} as const;
export type OAuthProvider = (typeof OAuthProvider)[keyof typeof OAuthProvider];

export const ProductStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const Currency = {
  NPR: 'NPR',
  USD: 'USD',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

/** Status flow is strictly ordered - see F1.3 "cannot skip". */
export const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = {
  ESEWA: 'ESEWA',
  KHALTI: 'KHALTI',
  CONNECTIPS: 'CONNECTIPS',
  FONEPAY: 'FONEPAY',
  IME_PAY: 'IME_PAY',
  STRIPE: 'STRIPE',
  PAYPAL: 'PAYPAL',
  BANK_TRANSFER: 'BANK_TRANSFER',
  COD: 'COD',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const RefundStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];

export const CouponType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
  FREE_SHIPPING: 'FREE_SHIPPING',
} as const;
export type CouponType = (typeof CouponType)[keyof typeof CouponType];

export const NotificationType = {
  ORDER: 'ORDER',
  PROMO: 'PROMO',
  SYSTEM: 'SYSTEM',
  PRICE_DROP: 'PRICE_DROP',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const ContactStatus = {
  NEW: 'NEW',
  READ: 'READ',
  REPLIED: 'REPLIED',
} as const;
export type ContactStatus = (typeof ContactStatus)[keyof typeof ContactStatus];

export const AdminAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  EXPORT: 'EXPORT',
} as const;
export type AdminAction = (typeof AdminAction)[keyof typeof AdminAction];
