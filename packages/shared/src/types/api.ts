/**
 * Transport-level API contracts shared by apps/web and apps/api.
 * Domain entity types live alongside their Zod schemas in ../schemas.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  statusCode: number;
  message: string;
  /** Populated when a Zod schema rejects the payload. */
  errors?: ApiFieldError[];
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Faceted counts returned by Meilisearch-backed listing endpoints (Phase 3). */
export interface Facet {
  value: string;
  count: number;
}

export interface ProductFacets {
  categories: Facet[];
  brands: Facet[];
  ratings: Facet[];
  priceRange: { min: number; max: number };
}

export interface AuthTokens {
  accessToken: string;
  /** Refresh tokens travel in an HttpOnly cookie (D1) - never in this payload. */
  expiresIn: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  environment: string;
}
