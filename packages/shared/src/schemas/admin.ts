import { z } from 'zod';

import {
  AccountStatus,
  AdminAction,
  ContactStatus,
  CouponType,
  Currency,
  OrderStatus,
  ProductStatus,
  UserRole,
} from '../enums.js';
import { CARRIER_IDS } from '../constants.js';
import {
  emailSchema,
  paginationSchema,
  phoneSchema,
  priceSchema,
  uuidSchema,
} from './common.js';

/* ========================================================================== */
/*  ANALYTICS (Phase 8)                                                       */
/* ========================================================================== */

/**
 * Named ranges the date picker offers.
 *
 * A preset rather than two dates is what the dashboard actually asks for, and
 * it keeps the cache key short. `custom` is the only value that requires
 * `from`/`to`, which the refinement below enforces - otherwise a client could
 * ask for "custom" and silently receive the last 30 days.
 */
export const ANALYTICS_PRESETS = ['today', '7d', '30d', '90d', '12m', 'custom'] as const;
export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number];

export const ANALYTICS_GRANULARITIES = ['day', 'week', 'month'] as const;
export type AnalyticsGranularity = (typeof ANALYTICS_GRANULARITIES)[number];

export const analyticsRangeSchema = z
  .object({
    preset: z.enum(ANALYTICS_PRESETS).default('30d'),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    granularity: z.enum(ANALYTICS_GRANULARITIES).default('day'),
  })
  .refine((value) => value.preset !== 'custom' || (value.from && value.to), {
    message: 'A custom range needs both "from" and "to"',
    path: ['from'],
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '"from" must be on or before "to"',
    path: ['from'],
  });

export type AnalyticsRangeInput = z.infer<typeof analyticsRangeSchema>;

/** A figure alongside the same figure one period earlier. */
export interface MetricDelta {
  current: number;
  previous: number;
  /** Null when the previous period was zero - "+Infinity%" is not a useful number. */
  changePct: number | null;
}

export interface DashboardRevenue {
  today: MetricDelta;
  week: MetricDelta;
  month: MetricDelta;
  /** All time, so there is nothing to compare it against. */
  total: number;
  currency: Currency;
}

/** Live counts per status, for the worklist cards along the top. */
export type DashboardOrderCounts = Record<OrderStatus, number> & { total: number };

export interface RevenuePoint {
  /** ISO date (YYYY-MM-DD) - the bucket start, in store time. */
  date: string;
  revenue: number;
  orders: number;
  refunds: number;
}

export interface TopProductRow {
  productId: string;
  name: string;
  slug: string;
  sku: string;
  imageUrl: string | null;
  unitsSold: number;
  revenue: number;
  orderCount: number;
}

export interface TopCustomerRow {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: string | null;
}

export interface RecentOrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  status: OrderStatus;
  total: number;
  currency: Currency;
  itemCount: number;
  placedAt: string;
}

export interface LowStockRow {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  quantity: number;
  reserved: number;
  reorderLevel: number;
}

/** Everything /admin/dashboard renders, in one round trip. */
export interface DashboardSummary {
  revenue: DashboardRevenue;
  orders: DashboardOrderCounts;
  customers: { total: number; newThisMonth: MetricDelta };
  averageOrderValue: MetricDelta;
  series: RevenuePoint[];
  topProducts: TopProductRow[];
  topCustomers: TopCustomerRow[];
  recentOrders: RecentOrderRow[];
  lowStock: LowStockRow[];
  generatedAt: string;
}

/* --- The deeper /admin/analytics page ------------------------------------- */

export interface AnalyticsSeriesPoint {
  date: string;
  revenue: number;
  orders: number;
  visitors: number;
  /** Orders divided by unique visiting sessions, as a percentage. */
  conversionRate: number;
  averageOrderValue: number;
}

export interface AnalyticsTotals {
  revenue: number;
  orders: number;
  visitors: number;
  conversionRate: number;
  averageOrderValue: number;
  refunds: number;
  newCustomers: number;
  unitsSold: number;
}

export interface AnalyticsOverview {
  range: { from: string; to: string; granularity: AnalyticsGranularity };
  totals: AnalyticsTotals;
  /** The immediately preceding window of the same length. */
  previous: AnalyticsTotals;
  series: AnalyticsSeriesPoint[];
  currency: Currency;
}

export interface ProductPerformanceRow {
  productId: string;
  name: string;
  sku: string;
  categoryName: string;
  unitsSold: number;
  revenue: number;
  views: number;
  /** Units sold per hundred product-page views. */
  conversionRate: number;
  refundedUnits: number;
}

export interface TrafficSourceRow {
  /** "Direct", "Google", "Facebook", or the bare referrer host. */
  source: string;
  visits: number;
  sessions: number;
  share: number;
}

export interface GeoRow {
  district: string;
  province: string;
  latitude: number;
  longitude: number;
  orders: number;
  revenue: number;
  customers: number;
}

export interface AnalyticsReport {
  overview: AnalyticsOverview;
  products: ProductPerformanceRow[];
  traffic: TrafficSourceRow[];
  geography: GeoRow[];
}

/** Which report `GET /admin/analytics/export` should render as CSV. */
export const ANALYTICS_EXPORTS = ['overview', 'products', 'traffic', 'geography'] as const;
export type AnalyticsExport = (typeof ANALYTICS_EXPORTS)[number];

export const analyticsExportSchema = z
  .object({
    preset: z.enum(ANALYTICS_PRESETS).default('30d'),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    granularity: z.enum(ANALYTICS_GRANULARITIES).default('day'),
    report: z.enum(ANALYTICS_EXPORTS).default('overview'),
  })
  .refine((value) => value.preset !== 'custom' || (value.from && value.to), {
    message: 'A custom range needs both "from" and "to"',
    path: ['from'],
  });

export type AnalyticsExportInput = z.infer<typeof analyticsExportSchema>;

/* --- Page-view ingestion -------------------------------------------------- */

/**
 * Payload for `POST /analytics/track`, sent by the storefront beacon.
 *
 * Deliberately thin: no cookies, no fingerprint, no third party. The session id
 * is a random string the browser keeps in `sessionStorage`, which is enough to
 * count a visit and dies when the tab does. Country and city are resolved
 * server-side from the request, never sent by the client - a value the browser
 * supplies is a value an attacker supplies.
 */
export const trackPageViewSchema = z.object({
  sessionId: z.string().min(8).max(120),
  pagePath: z.string().min(1).max(500),
  referrer: z.string().max(500).optional().nullable(),
  durationMs: z.number().int().nonnegative().max(86_400_000).optional().nullable(),
});

export type TrackPageViewInput = z.infer<typeof trackPageViewSchema>;

/**
 * Core Web Vitals reported from the browser (Phase 11).
 *
 * `name` is a free string rather than an enum on purpose: the metric set is
 * owned by the web-vitals library and it changes - FID was retired in favour of
 * INP in 2024 - so pinning it here would mean a release of this package every
 * time Google revises the standard. The length cap is the guard that matters.
 *
 * CLS is a unitless score under 1; every other metric is milliseconds. The
 * upper bound is generous enough to keep a genuinely terrible load (a 60s LCP
 * on a stalled connection) rather than silently dropping the worst data.
 */
export const webVitalSchema = z.object({
  sessionId: z.string().min(8).max(120),
  name: z.string().min(2).max(16),
  value: z.number().nonnegative().max(600_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  pagePath: z.string().min(1).max(500),
  connection: z.string().max(20).optional().nullable(),
});

export type WebVitalInput = z.infer<typeof webVitalSchema>;

/* ========================================================================== */
/*  CUSTOMERS                                                                 */
/* ========================================================================== */

export const CUSTOMER_SORTS = ['newest', 'oldest', 'ltv_high', 'orders_high', 'name'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const adminCustomerQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.nativeEnum(AccountStatus).optional(),
  role: z.nativeEnum(UserRole).optional(),
  /** True to hide accounts that have never checked out. */
  hasOrders: z.coerce.boolean().optional(),
  sort: z.enum(CUSTOMER_SORTS).default('newest'),
});

export type AdminCustomerQueryInput = z.infer<typeof adminCustomerQuerySchema>;

export interface AdminCustomerListItem {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CustomerOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  currency: Currency;
  itemCount: number;
  placedAt: string;
}

export interface CustomerAddressRow {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  street: string;
  city: string;
  district: string;
  province: string;
  country: string;
  isDefault: boolean;
}

export interface CustomerCommunicationRow {
  id: string;
  channel: 'NOTIFICATION' | 'CONTACT';
  title: string;
  body: string;
  status: string;
  createdAt: string;
}

export interface AdminCustomerDetail extends AdminCustomerListItem {
  averageOrderValue: number;
  firstOrderAt: string | null;
  totalRefunded: number;
  reviewCount: number;
  wishlistCount: number;
  cartItemCount: number;
  couponsUsed: number;
  addresses: CustomerAddressRow[];
  orders: CustomerOrderRow[];
  communications: CustomerCommunicationRow[];
  /** Districts this customer has ever shipped to, most recent first. */
  districts: string[];
}

export const customerStatusSchema = z.object({
  status: z.nativeEnum(AccountStatus),
  reason: z.string().max(500).optional(),
});

export type CustomerStatusInput = z.infer<typeof customerStatusSchema>;

/**
 * A message an admin sends a customer from their detail page.
 *
 * `NOTIFICATION` writes a row the shopper sees in their bell; `EMAIL` also
 * sends one. Both are recorded, so the communication tab is a real history
 * rather than a guess at what was said.
 */
export const customerMessageSchema = z.object({
  channel: z.enum(['NOTIFICATION', 'EMAIL']).default('NOTIFICATION'),
  subject: z.string().min(3, 'A subject is required').max(160),
  body: z.string().min(5, 'Write a message').max(1000),
});

export type CustomerMessageInput = z.infer<typeof customerMessageSchema>;

/* ========================================================================== */
/*  ACTIVITY LOG                                                              */
/* ========================================================================== */

export const activityLogQuerySchema = paginationSchema.extend({
  adminId: uuidSchema.optional(),
  action: z.nativeEnum(AdminAction).optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ActivityLogQueryInput = z.infer<typeof activityLogQuerySchema>;

/** One before/after pair, already reduced to the fields that actually moved. */
export interface ActivityDiffField {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ActivityDetails {
  summary?: string;
  diff?: ActivityDiffField[];
  method?: string;
  path?: string;
  [key: string]: unknown;
}

export interface AdminActivityEntry {
  id: string;
  adminId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  action: AdminAction;
  entityType: string;
  entityId: string | null;
  details: ActivityDetails | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/* ========================================================================== */
/*  COUPONS (admin CRUD)                                                      */
/* ========================================================================== */

export const COUPON_STATES = ['all', 'active', 'scheduled', 'expired', 'exhausted'] as const;
export type CouponState = (typeof COUPON_STATES)[number];

export const adminCouponQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(60).optional(),
  type: z.nativeEnum(CouponType).optional(),
  state: z.enum(COUPON_STATES).default('all'),
  sort: z.enum(['newest', 'code', 'redemptions', 'expiring']).default('newest'),
});

export type AdminCouponQueryInput = z.infer<typeof adminCouponQuerySchema>;

/** Derived, not stored: a coupon's state is a function of dates and counters. */
export type CouponLifecycle = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'EXHAUSTED' | 'DISABLED';

export interface AdminCouponListItem {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number | null;
  validFrom: string;
  validUntil: string;
  applicableCategories: string[];
  applicableProducts: string[];
  isActive: boolean;
  lifecycle: CouponLifecycle;
  /** Order value that carried this code - what the discount actually bought. */
  revenueInfluenced: number;
  uniqueUsers: number;
  createdAt: string;
  updatedAt: string;
}

export interface CouponUsageEntry {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderTotal: number | null;
  discountAmount: number | null;
  usedAt: string;
}

export interface AdminCouponDetail extends AdminCouponListItem {
  usages: CouponUsageEntry[];
  categoryNames: string[];
  productNames: string[];
}

/* ========================================================================== */
/*  CONTACT MESSAGES                                                          */
/* ========================================================================== */

export const adminContactQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(ContactStatus).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export type AdminContactQueryInput = z.infer<typeof adminContactQuerySchema>;

export interface AdminContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  repliedAt: string | null;
  repliedBy: string | null;
  repliedByName: string | null;
  createdAt: string;
}

export const contactStatusSchema = z.object({
  status: z.nativeEnum(ContactStatus),
});

export type ContactStatusInput = z.infer<typeof contactStatusSchema>;

export const contactReplySchema = z.object({
  subject: z.string().min(3).max(200).optional(),
  body: z.string().min(5, 'Write a reply').max(5000),
});

export type ContactReplyInput = z.infer<typeof contactReplySchema>;

/* ========================================================================== */
/*  STORE SETTINGS                                                            */
/* ========================================================================== */

/**
 * `.or(z.literal(''))` on every URL field is deliberate: a cleared input in a
 * browser sends an empty string, not null, and rejecting that would make the
 * only way to remove a logo be to type a valid URL first.
 */
const optionalUrl = z.union([z.string().url(), z.literal(''), z.null()]).optional();

export const storeGeneralSchema = z.object({
  name: z.string().min(2, 'Store name is required').max(80),
  tagline: z.string().max(160).optional().nullable(),
  contactEmail: emailSchema,
  contactPhone: z.union([phoneSchema, z.literal(''), z.null()]).optional(),
  logoUrl: optionalUrl,
  faviconUrl: optionalUrl,
});

export type StoreGeneral = z.infer<typeof storeGeneralSchema>;

export const storeCurrencySchema = z.object({
  default: z.nativeEnum(Currency),
  supported: z.array(z.nativeEnum(Currency)).min(1, 'Support at least one currency'),
  /** NPR per 1 USD. Presentation only - orders are captured in one currency. */
  usdToNpr: z.number().positive().max(100_000).default(133),
});

export type StoreCurrencySettings = z.infer<typeof storeCurrencySchema>;

export const storeTaxSchema = z.object({
  /** A fraction, not a percentage: 0.13 is Nepal's 13% VAT. */
  rate: z.number().min(0, 'Tax cannot be negative').max(1, 'Enter a fraction, e.g. 0.13 for 13%'),
  label: z.string().min(1).max(20),
  /** True when displayed prices already contain the tax. */
  inclusive: z.boolean(),
  registrationNumber: z.string().max(40).optional().nullable(),
});

export type StoreTaxSettings = z.infer<typeof storeTaxSchema>;

export const shippingZoneConfigSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: z.string().min(2, 'Name this zone').max(80),
    /** District names from NEPAL_DISTRICTS; empty means "everywhere else". */
    districts: z.array(z.string().max(60)).default([]),
    flatRate: priceSchema,
    freeShippingThreshold: priceSchema.optional().nullable(),
    estimatedDaysMin: z.number().int().min(0).max(60),
    estimatedDaysMax: z.number().int().min(0).max(90),
    isActive: z.boolean().default(true),
  })
  .refine((zone) => zone.estimatedDaysMax >= zone.estimatedDaysMin, {
    message: 'The maximum must be at least the minimum',
    path: ['estimatedDaysMax'],
  });

export type ShippingZoneConfig = z.infer<typeof shippingZoneConfigSchema>;

export const storeShippingSchema = z.object({
  freeShippingThreshold: priceSchema,
  defaultFlatRate: priceSchema,
  defaultCarrier: z.union([z.enum(CARRIER_IDS), z.null()]).optional(),
  zones: z.array(shippingZoneConfigSchema).max(50).default([]),
});

export type StoreShippingSettings = z.infer<typeof storeShippingSchema>;

export const storePaymentsSchema = z.object({
  /** Gateways offered at checkout, in the order they are shown. */
  enabled: z.array(z.string().max(30)).default([]),
  available: z.array(z.string().max(30)).default([]),
  /** Cash on delivery is a liability, so it gets its own ceiling. */
  codMaxOrderValue: priceSchema.optional().nullable(),
  testMode: z.boolean().default(true),
});

export type StorePaymentSettings = z.infer<typeof storePaymentsSchema>;

export const NOTIFICATION_TEMPLATE_KEYS = [
  'order.confirmed',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'order.refunded',
  'contact.reply',
] as const;

export type NotificationTemplateKey = (typeof NOTIFICATION_TEMPLATE_KEYS)[number];

/**
 * One message template. `{{order_number}}`-style placeholders are substituted
 * at send time; the editor lists the ones each template understands rather than
 * letting an operator invent a variable that will render literally.
 */
export const messageTemplateSchema = z.object({
  key: z.enum(NOTIFICATION_TEMPLATE_KEYS),
  emailSubject: z.string().min(3).max(200),
  emailBody: z.string().min(10).max(8000),
  /** SMS is metered per 160 characters in Nepal, hence the tight cap. */
  smsBody: z.string().max(320).optional().nullable(),
  emailEnabled: z.boolean().default(true),
  smsEnabled: z.boolean().default(false),
});

export type MessageTemplate = z.infer<typeof messageTemplateSchema>;

/** The placeholders each template understands, shown beside its editor. */
export const TEMPLATE_VARIABLES: Readonly<Record<NotificationTemplateKey, readonly string[]>> = {
  'order.confirmed': ['customer_name', 'order_number', 'order_total', 'order_url'],
  'order.shipped': ['customer_name', 'order_number', 'carrier', 'tracking_number', 'tracking_url'],
  'order.delivered': ['customer_name', 'order_number', 'review_url'],
  'order.cancelled': ['customer_name', 'order_number', 'reason'],
  'order.refunded': ['customer_name', 'order_number', 'refund_amount'],
  'contact.reply': ['name', 'subject', 'reply_body'],
} as const;

export const storeTemplatesSchema = z.object({
  templates: z.array(messageTemplateSchema).max(20).default([]),
});

export type StoreTemplateSettings = z.infer<typeof storeTemplatesSchema>;

export const storeSocialSchema = z.object({
  facebook: optionalUrl,
  instagram: optionalUrl,
  tiktok: optionalUrl,
  youtube: optionalUrl,
});

export type StoreSocialSettings = z.infer<typeof storeSocialSchema>;

export const storeMaintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(500),
});

export type StoreMaintenanceSettings = z.infer<typeof storeMaintenanceSchema>;

/**
 * The whole settings document.
 *
 * Stored as one row per section in `store_settings` (a JSONB key/value table),
 * assembled into this shape on read. Sections rather than one blob so two
 * admins editing different tabs cannot clobber each other.
 */
export const storeSettingsSchema = z.object({
  general: storeGeneralSchema,
  currency: storeCurrencySchema,
  tax: storeTaxSchema,
  shipping: storeShippingSchema,
  payments: storePaymentsSchema,
  social: storeSocialSchema,
  maintenance: storeMaintenanceSchema,
  notifications: storeTemplatesSchema,
});

export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const SETTINGS_SECTIONS = [
  'general',
  'currency',
  'tax',
  'shipping',
  'payments',
  'social',
  'maintenance',
  'notifications',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** `PATCH /admin/settings` takes any subset of sections, each fully valid. */
export const settingsPatchSchema = storeSettingsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Send at least one section to update',
  });

export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;

/** The slice of settings the storefront is allowed to read without a token. */
export interface PublicStoreSettings {
  general: StoreGeneral;
  currency: StoreCurrencySettings;
  tax: Pick<StoreTaxSettings, 'rate' | 'label' | 'inclusive'>;
  shipping: Pick<StoreShippingSettings, 'freeShippingThreshold' | 'defaultFlatRate'>;
  payments: Pick<StorePaymentSettings, 'enabled'>;
  social: StoreSocialSettings;
  maintenance: StoreMaintenanceSettings;
}

/* ========================================================================== */
/*  ADMIN NOTIFICATIONS (the bell)                                            */
/* ========================================================================== */

export const ADMIN_NOTIFICATION_KINDS = [
  'ORDER_PLACED',
  'ORDER_PAID',
  'ORDER_CANCELLED',
  'REFUND_ISSUED',
  'LOW_STOCK',
  'CONTACT_MESSAGE',
] as const;

export type AdminNotificationKind = (typeof ADMIN_NOTIFICATION_KINDS)[number];

export interface AdminNotification {
  id: string;
  kind: AdminNotificationKind;
  title: string;
  body: string;
  /** Where clicking it should land, e.g. `/admin/orders?search=ORD-...`. */
  href: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export const adminNotificationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

export type AdminNotificationQueryInput = z.infer<typeof adminNotificationQuerySchema>;

export const markNotificationsSchema = z.object({
  /** Omit to mark everything read. */
  ids: z.array(uuidSchema).max(100).optional(),
});

export type MarkNotificationsInput = z.infer<typeof markNotificationsSchema>;

/* ========================================================================== */
/*  GLOBAL ADMIN SEARCH                                                       */
/* ========================================================================== */

export const adminSearchSchema = z.object({
  q: z.string().trim().min(2, 'Type at least two characters').max(120),
  limit: z.coerce.number().int().positive().max(20).default(5),
});

export type AdminSearchInput = z.infer<typeof adminSearchSchema>;

export interface AdminSearchHit {
  type: 'product' | 'order' | 'customer' | 'coupon';
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export interface AdminSearchResults {
  hits: AdminSearchHit[];
  took: number;
}

/* ========================================================================== */
/*  PRODUCTS (the admin table)                                                */
/* ========================================================================== */

export const ADMIN_PRODUCT_SORTS = [
  'newest',
  'oldest',
  'name_asc',
  'name_desc',
  'price_asc',
  'price_desc',
  'stock_asc',
  'stock_desc',
  'updated',
] as const;

export type AdminProductSort = (typeof ADMIN_PRODUCT_SORTS)[number];

/**
 * The admin catalog view.
 *
 * Separate from `productQuerySchema` because the two want opposite defaults.
 * The storefront's query hardcodes "active, not deleted" - correct for a
 * shopper, and exactly wrong for the person whose job is to find the draft they
 * were halfway through writing. This one shows everything unless told not to.
 */
export const adminProductQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  categoryId: uuidSchema.optional(),
  brand: z.string().max(80).optional(),
  featured: z.coerce.boolean().optional(),
  lowStock: z.coerce.boolean().optional(),
  /** Soft-deleted products are hidden unless explicitly asked for. */
  includeArchived: z.coerce.boolean().default(false),
  sort: z.enum(ADMIN_PRODUCT_SORTS).default('newest'),
});

export type AdminProductQueryInput = z.infer<typeof adminProductQuerySchema>;

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  brand: string | null;
  status: ProductStatus;
  isActive: boolean;
  isFeatured: boolean;
  basePrice: number;
  compareAtPrice: number | null;
  currency: Currency;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  variantCount: number;
  stockQuantity: number;
  viewCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const BULK_PRODUCT_ACTIONS = [
  'ACTIVATE',
  'DRAFT',
  'ARCHIVE',
  'FEATURE',
  'UNFEATURE',
  'RESTORE',
  'DELETE',
] as const;

export type BulkProductAction = (typeof BULK_PRODUCT_ACTIONS)[number];

export const bulkProductActionSchema = z.object({
  productIds: z.array(uuidSchema).min(1, 'Select at least one product').max(200),
  action: z.enum(BULK_PRODUCT_ACTIONS),
});

export type BulkProductActionInput = z.infer<typeof bulkProductActionSchema>;

/**
 * Per-row outcomes rather than one count.
 *
 * A bulk action over two hundred products will have rows that cannot move -
 * a product with open orders, one already archived - and failing the whole
 * batch because of one of them is the wrong trade. Each failure comes back with
 * a reason attached, the same contract bulk order updates use.
 */
export interface BulkProductResult {
  updated: number;
  failures: Array<{ productId: string; name: string; reason: string }>;
}
