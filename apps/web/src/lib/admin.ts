import type {
  ActivityLogQueryInput,
  AdminActivityEntry,
  AdminContactMessage,
  AdminContactQueryInput,
  AdminCouponDetail,
  AdminCouponListItem,
  AdminCouponQueryInput,
  AdminCustomerDetail,
  AdminCustomerListItem,
  AdminCustomerQueryInput,
  AdminNotification,
  AdminSearchResults,
  AnalyticsOverview,
  AnalyticsPreset,
  DashboardSummary,
  GeoRow,
  Paginated,
  ProductPerformanceRow,
  StoreSettings,
  TrafficSourceRow,
} from '@bazaar/shared';

import { apiFetch } from '@/lib/api';

/* -------------------------------------------------------------------------- */
/*  Query keys                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One place every admin query key is spelled.
 *
 * Written as a nested factory rather than as inline arrays so an invalidation
 * can target a whole branch - `adminKeys.coupons.all` after a create, without
 * having to know which filters happened to be on screen at the time.
 */
export const adminKeys = {
  dashboard: ['admin', 'dashboard'] as const,

  analytics: {
    all: ['admin', 'analytics'] as const,
    overview: (range: RangeParams) => ['admin', 'analytics', 'overview', range] as const,
    products: (range: RangeParams) => ['admin', 'analytics', 'products', range] as const,
    traffic: (range: RangeParams) => ['admin', 'analytics', 'traffic', range] as const,
    geography: (range: RangeParams) => ['admin', 'analytics', 'geography', range] as const,
  },

  customers: {
    all: ['admin', 'customers'] as const,
    list: (query: Partial<AdminCustomerQueryInput>) => ['admin', 'customers', query] as const,
    detail: (id: string) => ['admin', 'customers', 'detail', id] as const,
  },

  coupons: {
    all: ['admin', 'coupons'] as const,
    list: (query: Partial<AdminCouponQueryInput>) => ['admin', 'coupons', query] as const,
    detail: (id: string) => ['admin', 'coupons', 'detail', id] as const,
  },

  contacts: {
    all: ['admin', 'contacts'] as const,
    list: (query: Partial<AdminContactQueryInput>) => ['admin', 'contacts', query] as const,
    counts: ['admin', 'contacts', 'counts'] as const,
  },

  settings: ['admin', 'settings'] as const,
  notifications: ['admin', 'notifications'] as const,
  activity: (query: Partial<ActivityLogQueryInput>) => ['admin', 'activity', query] as const,
  search: (term: string) => ['admin', 'search', term] as const,
} as const;

/* -------------------------------------------------------------------------- */
/*  Range                                                                     */
/* -------------------------------------------------------------------------- */

export interface RangeParams {
  preset: AnalyticsPreset;
  /** ISO dates (YYYY-MM-DD). Only read when `preset` is "custom". */
  from?: string;
  to?: string;
}

/**
 * Builds the query string for a range.
 *
 * `from`/`to` are dropped unless the preset is custom, so a stale custom range
 * left in component state cannot silently narrow a "last 30 days" request - and
 * two requests for the same preset produce the same cache key.
 */
export function rangeQuery(range: RangeParams): string {
  const params = new URLSearchParams({ preset: range.preset });

  if (range.preset === 'custom') {
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
  }

  return params.toString();
}

/** Drops empty values so a blank filter is absent rather than sent as "". */
export function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    search.set(key, String(value));
  }

  return search.toString();
}

/* -------------------------------------------------------------------------- */
/*  Fetchers                                                                  */
/* -------------------------------------------------------------------------- */

export const adminApi = {
  dashboard: (): Promise<DashboardSummary> =>
    apiFetch<DashboardSummary>('/admin/analytics/dashboard'),

  analyticsOverview: (range: RangeParams): Promise<AnalyticsOverview> =>
    apiFetch<AnalyticsOverview>(`/admin/analytics/overview?${rangeQuery(range)}`),

  analyticsProducts: (range: RangeParams): Promise<ProductPerformanceRow[]> =>
    apiFetch<ProductPerformanceRow[]>(`/admin/analytics/products?${rangeQuery(range)}`),

  analyticsTraffic: (range: RangeParams): Promise<TrafficSourceRow[]> =>
    apiFetch<TrafficSourceRow[]>(`/admin/analytics/traffic?${rangeQuery(range)}`),

  analyticsGeography: (range: RangeParams): Promise<GeoRow[]> =>
    apiFetch<GeoRow[]>(`/admin/analytics/geography?${rangeQuery(range)}`),

  customers: (query: string): Promise<Paginated<AdminCustomerListItem>> =>
    apiFetch<Paginated<AdminCustomerListItem>>(`/admin/customers?${query}`),

  customer: (id: string): Promise<AdminCustomerDetail> =>
    apiFetch<AdminCustomerDetail>(`/admin/customers/${id}`),

  coupons: (query: string): Promise<Paginated<AdminCouponListItem>> =>
    apiFetch<Paginated<AdminCouponListItem>>(`/admin/coupons?${query}`),

  coupon: (id: string): Promise<AdminCouponDetail> =>
    apiFetch<AdminCouponDetail>(`/admin/coupons/${id}`),

  contacts: (query: string): Promise<Paginated<AdminContactMessage>> =>
    apiFetch<Paginated<AdminContactMessage>>(`/admin/contacts?${query}`),

  contactCounts: (): Promise<Record<string, number>> =>
    apiFetch<Record<string, number>>('/admin/contacts/counts'),

  settings: (): Promise<StoreSettings> => apiFetch<StoreSettings>('/admin/settings'),

  activity: (query: string): Promise<Paginated<AdminActivityEntry>> =>
    apiFetch<Paginated<AdminActivityEntry>>(`/admin/activity?${query}`),

  notifications: (): Promise<{ items: AdminNotification[]; unread: number }> =>
    apiFetch<{ items: AdminNotification[]; unread: number }>('/admin/notifications?limit=20'),

  search: (term: string): Promise<AdminSearchResults> =>
    apiFetch<AdminSearchResults>(`/admin/search?q=${encodeURIComponent(term)}`),
};

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                */
/* -------------------------------------------------------------------------- */

/** "+12.4%" / "-3.1%" / "New" when there was nothing to compare against. */
export function formatChange(changePct: number | null): string {
  if (changePct === null) return 'New';
  const sign = changePct >= 0 ? '+' : '';
  return `${sign}${changePct.toFixed(1)}%`;
}

/**
 * Whether a change should read as good.
 *
 * `inverted` is for the metrics where down is up - refunds and cancellations -
 * so the colour follows the meaning rather than the sign.
 */
export function changeTone(
  changePct: number | null,
  inverted = false,
): 'up' | 'down' | 'flat' {
  if (changePct === null || Math.abs(changePct) < 0.05) return 'flat';
  const positive = inverted ? changePct < 0 : changePct > 0;
  return positive ? 'up' : 'down';
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** "2 Sep, 14:32" - a timestamp an operator reads at a glance. */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  return new Intl.DateTimeFormat('en-NP', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** "3 minutes ago" for anything recent, falling back to a date past a week. */
export function formatRelative(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';

  const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86_400],
  ];

  for (const [unit, divisor] of units) {
    const next = divisor === 60 ? 3600 : divisor === 3600 ? 86_400 : 604_800;
    if (seconds < next) return relative.format(-Math.floor(seconds / divisor), unit);
  }

  return formatDateTime(date);
}
