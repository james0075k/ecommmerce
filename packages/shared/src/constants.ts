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
/*  Cart & shipping (C1.4)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The cart's shipping line is an *estimate* - the real rate depends on the
 * delivery district and is calculated at checkout in Phase 5. These two numbers
 * are what the storefront already promises on the product page, so the estimate
 * agrees with it.
 */
export const SHIPPING_FLAT_RATE = 100;
export const FREE_SHIPPING_THRESHOLD = 5000;

/** Matches the ceiling in `addToCartSchema` - one line cannot exceed this. */
export const CART_MAX_QUANTITY = 99;

/** Guest carts are keyed by this HttpOnly cookie until the shopper logs in. */
export const CART_SESSION_COOKIE = 'bz_cart';
export const CART_SESSION_TTL_DAYS = 30;

/** How long a removed cart line can be restored by the undo toast (G1). */
export const CART_UNDO_WINDOW_MS = 5_000;

/* -------------------------------------------------------------------------- */
/*  Shipping methods & zones (F1.6)                                           */
/* -------------------------------------------------------------------------- */

/**
 * The three valley districts. Nepal's courier economics split sharply here:
 * same-day and next-day delivery only exist inside the ring road, so this is
 * the one zone distinction that actually changes a rate.
 */
export const KATHMANDU_VALLEY_DISTRICTS = ['Kathmandu', 'Lalitpur', 'Bhaktapur'] as const;

export type ShippingZone = 'VALLEY' | 'OUTSIDE_VALLEY';

export function shippingZoneFor(district: string): ShippingZone {
  return (KATHMANDU_VALLEY_DISTRICTS as readonly string[]).includes(district)
    ? 'VALLEY'
    : 'OUTSIDE_VALLEY';
}

export interface ShippingMethodDefinition {
  readonly id: 'STANDARD' | 'EXPRESS';
  readonly label: string;
  readonly description: string;
  /** Base rate per zone, in NPR. */
  readonly rates: Readonly<Record<ShippingZone, number>>;
  /** Business days, used for the estimated-delivery line. */
  readonly etaDays: Readonly<Record<ShippingZone, [number, number]>>;
  /** Only Standard is ever free - Express is a real courier cost either way. */
  readonly freeOverThreshold: boolean;
}

export const SHIPPING_METHODS: readonly ShippingMethodDefinition[] = [
  {
    id: 'STANDARD',
    label: 'Standard delivery',
    description: 'Our regular courier network, covering all 77 districts.',
    rates: { VALLEY: 100, OUTSIDE_VALLEY: 150 },
    etaDays: { VALLEY: [2, 3], OUTSIDE_VALLEY: [4, 7] },
    freeOverThreshold: true,
  },
  {
    id: 'EXPRESS',
    label: 'Express delivery',
    description: 'Priority handling and the fastest available courier.',
    rates: { VALLEY: 250, OUTSIDE_VALLEY: 400 },
    etaDays: { VALLEY: [1, 1], OUTSIDE_VALLEY: [2, 3] },
    freeOverThreshold: false,
  },
] as const;

export type ShippingMethodId = ShippingMethodDefinition['id'];

export const SHIPPING_METHOD_IDS = SHIPPING_METHODS.map((method) => method.id) as [
  ShippingMethodId,
  ...ShippingMethodId[],
];

export const DEFAULT_SHIPPING_METHOD: ShippingMethodId = 'STANDARD';

/* -------------------------------------------------------------------------- */
/*  Order lifecycle                                                            */
/* -------------------------------------------------------------------------- */

/**
 * F1.3: a shopper may only cancel before the order is handed to a courier.
 * Past PROCESSING it becomes a return, which is a different flow entirely.
 */
export const CANCELLABLE_ORDER_STATUSES = ['PENDING', 'CONFIRMED'] as const;

/** How long an unpaid order holds its reserved stock before it is released. */
export const PAYMENT_WINDOW_MINUTES = 30;

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

/* -------------------------------------------------------------------------- */
/*  Order status machine (F1.3)                                                */
/* -------------------------------------------------------------------------- */

/**
 * Which statuses may follow which, for the admin status control.
 *
 * F1.3 says the flow "cannot skip", and the safest place to say so is a table
 * rather than a chain of `if`s in the service: an operator marking an order
 * DELIVERED that was never SHIPPED has almost certainly picked the wrong row,
 * and the courier hand-off is the step that sends the tracking SMS. Going
 * backwards is barred too - a status timeline that can rewind is not a record
 * of anything.
 *
 * CANCELLED and REFUNDED are terminal, and CANCELLED is reachable from
 * anywhere short of delivery because an operator sometimes has to stop an order
 * the shopper no longer can.
 */
export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  DELIVERED: [OrderStatus.REFUNDED],
  CANCELLED: [OrderStatus.REFUNDED],
  REFUNDED: [],
} as const;

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

/** How long after delivery we ask for a review (F1.3). */
export const REVIEW_REQUEST_DELAY_DAYS = 7;

/* -------------------------------------------------------------------------- */
/*  Couriers                                                                   */
/* -------------------------------------------------------------------------- */

export interface CarrierDefinition {
  id: string;
  label: string;
  /**
   * `{tracking}` is substituted with the consignment number. Null where the
   * courier has no public tracking page - the number is then shown as plain
   * text rather than a link that 404s.
   */
  trackingUrl: string | null;
}

/** The couriers Bazaar actually hands parcels to, Nepal first. */
export const CARRIERS: readonly CarrierDefinition[] = [
  { id: 'NCM', label: 'Nepal Can Move', trackingUrl: 'https://nepalcanmove.com/track/{tracking}' },
  { id: 'PATHAO', label: 'Pathao Courier', trackingUrl: 'https://merchant.pathao.com/tracking?consignment_id={tracking}' },
  { id: 'ARAMEX', label: 'Aramex', trackingUrl: 'https://www.aramex.com/track/results?ShipmentNumber={tracking}' },
  { id: 'DHL', label: 'DHL Express', trackingUrl: 'https://www.dhl.com/en/express/tracking.html?AWB={tracking}' },
  { id: 'FEDEX', label: 'FedEx', trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr={tracking}' },
  { id: 'UPS', label: 'UPS', trackingUrl: 'https://www.ups.com/track?tracknum={tracking}' },
  { id: 'SELF', label: 'Own delivery rider', trackingUrl: null },
  { id: 'OTHER', label: 'Other courier', trackingUrl: null },
] as const;

export const CARRIER_IDS = CARRIERS.map((carrier) => carrier.id) as [string, ...string[]];

/** The courier's tracking page for a consignment, or null when there is none. */
export function trackingUrlFor(carrier: string | null, tracking: string | null): string | null {
  if (!carrier || !tracking) return null;

  const definition = CARRIERS.find((candidate) => candidate.id === carrier);
  if (!definition?.trackingUrl) return null;

  return definition.trackingUrl.replace('{tracking}', encodeURIComponent(tracking));
}

export function carrierLabel(carrier: string | null): string | null {
  if (!carrier) return null;
  return CARRIERS.find((candidate) => candidate.id === carrier)?.label ?? carrier;
}

/* -------------------------------------------------------------------------- */
/*  Realtime (Socket.IO)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One room per order rather than one per user: a guest has no user id, and the
 * order id is already the only credential a guest order has.
 */
export const ORDER_ROOM_PREFIX = 'order:';

export function orderRoom(orderId: string): string {
  return `${ORDER_ROOM_PREFIX}${orderId}`;
}

export const ORDER_EVENTS = {
  /** Client -> server: start/stop listening to one order. */
  SUBSCRIBE: 'order:subscribe',
  UNSUBSCRIBE: 'order:unsubscribe',
  /** Server -> client. */
  UPDATED: 'order:updated',
} as const;

/**
 * The admin broadcast room.
 *
 * One room for every operator rather than one per admin: the bell shows store
 * events, not personal ones, and every admin looking at the queue should see
 * the same order land at the same moment. Membership is decided on `subscribe`
 * from the socket's verified role, so joining is not something a client can ask
 * for and be given.
 */
export const ADMIN_ROOM = 'admin:all';

export const ADMIN_EVENTS = {
  /** Client -> server: join the admin room (role-checked server-side). */
  SUBSCRIBE: 'admin:subscribe',
  UNSUBSCRIBE: 'admin:unsubscribe',
  /** Server -> client: something happened that an operator should look at. */
  NOTIFICATION: 'admin:notification',
} as const;

/**
 * Approximate centroids for the districts Bazaar actually ships to, used to
 * place markers on the analytics map. Only districts with real order volume are
 * listed; anything else falls back to its province centroid, which is why the
 * province table follows.
 */
export const DISTRICT_COORDINATES: Readonly<Record<string, readonly [number, number]>> = {
  Kathmandu: [27.7172, 85.324],
  Lalitpur: [27.6644, 85.3188],
  Bhaktapur: [27.671, 85.4298],
  Kaski: [28.2096, 83.9856],
  Chitwan: [27.5291, 84.3542],
  Morang: [26.6646, 87.2718],
  Sunsari: [26.6273, 87.1716],
  Jhapa: [26.6428, 87.9], 
  Rupandehi: [27.6866, 83.4323],
  Kailali: [28.6906, 80.5898],
  Banke: [28.0505, 81.6167],
  Dhanusha: [26.8065, 85.9255],
  Parsa: [27.0, 84.8667],
  Bara: [27.0333, 85.0333],
  Makwanpur: [27.4167, 85.0333],
  Palpa: [27.8667, 83.55],
  Dang: [28.0, 82.3],
  Surkhet: [28.6, 81.6333],
  Ilam: [26.9094, 87.9286],
  Sarlahi: [26.9833, 85.55],
} as const;

export const PROVINCE_COORDINATES: Readonly<Record<string, readonly [number, number]>> = {
  Koshi: [26.9, 87.3],
  Madhesh: [26.9, 85.6],
  Bagmati: [27.7, 85.3],
  Gandaki: [28.25, 84.0],
  Lumbini: [27.7, 82.9],
  Karnali: [29.1, 82.2],
  Sudurpashchim: [29.0, 80.7],
} as const;

/** Where a district sits, falling back to its province, then to Kathmandu. */
export function coordinatesFor(
  district: string | null,
  province: string | null,
): readonly [number, number] {
  if (district && DISTRICT_COORDINATES[district]) return DISTRICT_COORDINATES[district];
  if (province && PROVINCE_COORDINATES[province]) return PROVINCE_COORDINATES[province];
  return [27.7172, 85.324];
}

/** Stock at or below this many units is surfaced as a low-stock alert. */
export const LOW_STOCK_THRESHOLD = 10;

/* -------------------------------------------------------------------------- */
/*  AI (Phase 10)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Browsing history is per *visitor*, not per shopper: the whole point of the
 * "Recommended for you" rail is that it works before anyone logs in. A signed-in
 * shopper is keyed by their user id, everyone else by this HttpOnly cookie -
 * minted only when something is actually tracked, the same rule the cart
 * follows.
 */
export const BROWSE_SESSION_COOKIE = 'bz_browse';
export const BROWSE_SESSION_TTL_DAYS = 30;

/** How many recently-viewed products the recommender reasons over. */
export const BROWSE_HISTORY_LIMIT = 20;

/**
 * A product needs this many approved reviews before a summary is worth the
 * call: below it, the card would be a paraphrase of two opinions rather than a
 * consensus, which is worse than showing nothing.
 */
export const REVIEW_SUMMARY_MIN_REVIEWS = 10;

/**
 * A stored summary is regenerated once this many new reviews have landed since
 * it was written. Cheap insurance against a card that still says "customers
 * love the battery" after fifty people said it swells.
 */
export const REVIEW_SUMMARY_STALE_AFTER = 5;

/** Tones the description generator writes in (E3 in the blueprint). */
export const AI_TONES = ['professional', 'casual', 'luxury'] as const;
export type AiTone = (typeof AI_TONES)[number];

export const AI_TONE_OPTIONS: ReadonlyArray<{ value: AiTone; label: string; hint: string }> = [
  { value: 'professional', label: 'Professional', hint: 'Clear, factual, spec-forward.' },
  { value: 'casual', label: 'Casual', hint: 'Warm and conversational.' },
  { value: 'luxury', label: 'Luxury', hint: 'Restrained, premium, unhurried.' },
];

/** Longest single message the chatbot accepts, and how much history it reads. */
export const AI_CHAT_MAX_MESSAGE = 1000;
export const AI_CHAT_HISTORY_LIMIT = 20;

/** The buttons the widget shows before the visitor has typed anything. */
export const AI_CHAT_QUICK_ACTIONS = [
  { id: 'track-order', label: 'Track my order', prompt: 'Where is my order?' },
  { id: 'find-product', label: 'Find a product', prompt: 'Help me find a product.' },
  { id: 'returns', label: 'Return policy', prompt: 'What is your return policy?' },
  { id: 'support', label: 'Contact support', prompt: 'I need to speak to a human.' },
] as const;

export const AI_CHAT_GREETING =
  "Hi! I'm Bazaar AI. I can help you find products, track orders, or answer questions.";

/* -------------------------------------------------------------------------- */
/*  Recommendations                                                           */
/* -------------------------------------------------------------------------- */

/** Why a product was recommended - surfaced as the rail's subtitle. */
export const RECOMMENDATION_REASONS = [
  'BOUGHT_TOGETHER',
  'SAME_CATEGORY',
  'SIMILAR_PRICE',
  'RECENTLY_VIEWED',
  'POPULAR',
] as const;

export type RecommendationReason = (typeof RECOMMENDATION_REASONS)[number];

export const RECOMMENDATION_REASON_LABELS: Readonly<Record<RecommendationReason, string>> = {
  BOUGHT_TOGETHER: 'Often bought together',
  SAME_CATEGORY: 'More like this',
  SIMILAR_PRICE: 'In the same price range',
  RECENTLY_VIEWED: 'Because you viewed this',
  POPULAR: 'Popular right now',
};
