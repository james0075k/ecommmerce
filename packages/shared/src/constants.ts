import {
  ContactStatus,
  CouponType,
  Currency,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  UserRole,
} from './enums.js';

/* -------------------------------------------------------------------------- */
/*  Enum value lists (for <select> options, Zod enums, validation)             */
/* -------------------------------------------------------------------------- */

export const USER_ROLES = Object.values(UserRole);
export const ORDER_STATUSES = Object.values(OrderStatus);
export const PAYMENT_METHODS = Object.values(PaymentMethod);
export const PAYMENT_STATUSES = Object.values(PaymentStatus);
export const PRODUCT_STATUSES = Object.values(ProductStatus);
export const COUPON_TYPES = Object.values(CouponType);
export const NOTIFICATION_TYPES = Object.values(NotificationType);
export const CONTACT_STATUSES = Object.values(ContactStatus);
export const CURRENCIES = Object.values(Currency);

/* -------------------------------------------------------------------------- */
/*  Order status flow (F1.3: PENDING -> CONFIRMED -> ... cannot skip)          */
/* -------------------------------------------------------------------------- */

export const ORDER_STATUS_FLOW = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
] as const;

/** Terminal statuses reachable from most points in the flow. */
export const ORDER_TERMINAL_STATUSES = [OrderStatus.CANCELLED, OrderStatus.REFUNDED] as const;

/* -------------------------------------------------------------------------- */
/*  Product sorting (G1: Price Low->High, High->Low, Newest, Popular, Rating)  */
/* -------------------------------------------------------------------------- */

export const PRODUCT_SORT_OPTIONS = [
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest First' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'rating', label: 'Top Rated' },
] as const;

export type ProductSortOption = (typeof PRODUCT_SORT_OPTIONS)[number]['value'];

export const PRODUCT_SORT_VALUES = PRODUCT_SORT_OPTIONS.map((o) => o.value) as [
  ProductSortOption,
  ...ProductSortOption[],
];

/* -------------------------------------------------------------------------- */
/*  Nepal administrative divisions - 7 provinces, 77 districts                 */
/* -------------------------------------------------------------------------- */

export const NEPAL_PROVINCES = [
  'Koshi',
  'Madhesh',
  'Bagmati',
  'Gandaki',
  'Lumbini',
  'Karnali',
  'Sudurpashchim',
] as const;

export type NepalProvince = (typeof NEPAL_PROVINCES)[number];

export interface NepalDistrict {
  readonly name: string;
  readonly province: NepalProvince;
}

/** All 77 districts of Nepal, each tagged with its province. */
export const NEPAL_DISTRICTS: readonly NepalDistrict[] = [
  // --- Koshi Province (14) ---
  { name: 'Bhojpur', province: 'Koshi' },
  { name: 'Dhankuta', province: 'Koshi' },
  { name: 'Ilam', province: 'Koshi' },
  { name: 'Jhapa', province: 'Koshi' },
  { name: 'Khotang', province: 'Koshi' },
  { name: 'Morang', province: 'Koshi' },
  { name: 'Okhaldhunga', province: 'Koshi' },
  { name: 'Panchthar', province: 'Koshi' },
  { name: 'Sankhuwasabha', province: 'Koshi' },
  { name: 'Solukhumbu', province: 'Koshi' },
  { name: 'Sunsari', province: 'Koshi' },
  { name: 'Taplejung', province: 'Koshi' },
  { name: 'Terhathum', province: 'Koshi' },
  { name: 'Udayapur', province: 'Koshi' },

  // --- Madhesh Province (8) ---
  { name: 'Bara', province: 'Madhesh' },
  { name: 'Dhanusha', province: 'Madhesh' },
  { name: 'Mahottari', province: 'Madhesh' },
  { name: 'Parsa', province: 'Madhesh' },
  { name: 'Rautahat', province: 'Madhesh' },
  { name: 'Saptari', province: 'Madhesh' },
  { name: 'Sarlahi', province: 'Madhesh' },
  { name: 'Siraha', province: 'Madhesh' },

  // --- Bagmati Province (13) ---
  { name: 'Bhaktapur', province: 'Bagmati' },
  { name: 'Chitwan', province: 'Bagmati' },
  { name: 'Dhading', province: 'Bagmati' },
  { name: 'Dolakha', province: 'Bagmati' },
  { name: 'Kathmandu', province: 'Bagmati' },
  { name: 'Kavrepalanchok', province: 'Bagmati' },
  { name: 'Lalitpur', province: 'Bagmati' },
  { name: 'Makwanpur', province: 'Bagmati' },
  { name: 'Nuwakot', province: 'Bagmati' },
  { name: 'Ramechhap', province: 'Bagmati' },
  { name: 'Rasuwa', province: 'Bagmati' },
  { name: 'Sindhuli', province: 'Bagmati' },
  { name: 'Sindhupalchok', province: 'Bagmati' },

  // --- Gandaki Province (11) ---
  { name: 'Baglung', province: 'Gandaki' },
  { name: 'Gorkha', province: 'Gandaki' },
  { name: 'Kaski', province: 'Gandaki' },
  { name: 'Lamjung', province: 'Gandaki' },
  { name: 'Manang', province: 'Gandaki' },
  { name: 'Mustang', province: 'Gandaki' },
  { name: 'Myagdi', province: 'Gandaki' },
  { name: 'Nawalpur', province: 'Gandaki' },
  { name: 'Parbat', province: 'Gandaki' },
  { name: 'Syangja', province: 'Gandaki' },
  { name: 'Tanahun', province: 'Gandaki' },

  // --- Lumbini Province (12) ---
  { name: 'Arghakhanchi', province: 'Lumbini' },
  { name: 'Banke', province: 'Lumbini' },
  { name: 'Bardiya', province: 'Lumbini' },
  { name: 'Dang', province: 'Lumbini' },
  { name: 'Gulmi', province: 'Lumbini' },
  { name: 'Kapilvastu', province: 'Lumbini' },
  { name: 'Palpa', province: 'Lumbini' },
  { name: 'Parasi', province: 'Lumbini' },
  { name: 'Pyuthan', province: 'Lumbini' },
  { name: 'Rolpa', province: 'Lumbini' },
  { name: 'Rukum East', province: 'Lumbini' },
  { name: 'Rupandehi', province: 'Lumbini' },

  // --- Karnali Province (10) ---
  { name: 'Dailekh', province: 'Karnali' },
  { name: 'Dolpa', province: 'Karnali' },
  { name: 'Humla', province: 'Karnali' },
  { name: 'Jajarkot', province: 'Karnali' },
  { name: 'Jumla', province: 'Karnali' },
  { name: 'Kalikot', province: 'Karnali' },
  { name: 'Mugu', province: 'Karnali' },
  { name: 'Rukum West', province: 'Karnali' },
  { name: 'Salyan', province: 'Karnali' },
  { name: 'Surkhet', province: 'Karnali' },

  // --- Sudurpashchim Province (9) ---
  { name: 'Achham', province: 'Sudurpashchim' },
  { name: 'Baitadi', province: 'Sudurpashchim' },
  { name: 'Bajhang', province: 'Sudurpashchim' },
  { name: 'Bajura', province: 'Sudurpashchim' },
  { name: 'Dadeldhura', province: 'Sudurpashchim' },
  { name: 'Darchula', province: 'Sudurpashchim' },
  { name: 'Doti', province: 'Sudurpashchim' },
  { name: 'Kailali', province: 'Sudurpashchim' },
  { name: 'Kanchanpur', province: 'Sudurpashchim' },
];

/** Flat list of district names - used by the Zod address schema. */
export const NEPAL_DISTRICT_NAMES = NEPAL_DISTRICTS.map((d) => d.name) as [string, ...string[]];

/** Districts grouped by province - drives the dependent select in checkout. */
export const DISTRICTS_BY_PROVINCE = NEPAL_PROVINCES.reduce(
  (acc, province) => {
    acc[province] = NEPAL_DISTRICTS.filter((d) => d.province === province).map((d) => d.name);
    return acc;
  },
  {} as Record<NepalProvince, string[]>,
);

/* -------------------------------------------------------------------------- */
/*  Store defaults                                                            */
/* -------------------------------------------------------------------------- */

export const DEFAULT_CURRENCY = Currency.NPR;
/** Nepal VAT (F1.6). */
export const DEFAULT_TAX_RATE = 0.13;
export const DEFAULT_COUNTRY = 'Nepal';

/* -------------------------------------------------------------------------- */
/*  API / pagination defaults                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

/** D3: 100 req/min per IP on the API, 20 req/min on auth endpoints. */
export const RATE_LIMIT_DEFAULT = { ttl: 60_000, limit: 100 } as const;
export const RATE_LIMIT_AUTH = { ttl: 60_000, limit: 20 } as const;

/** D1: max 5MB per uploaded image. */
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;
