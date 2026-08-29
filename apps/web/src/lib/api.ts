import type { ApiFieldError } from '@bazaar/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Thrown for any non-2xx response. `fieldErrors` carries the per-field messages
 * the API returns for a failed Zod validation, so forms can attach them to the
 * right input instead of showing one generic banner.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: ApiFieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** First message for a given field, if the API flagged it. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors.find((error) => error.field === field)?.message;
  }
}

/* -------------------------------------------------------------------------- */
/*  Access token - held in memory only                                        */
/* -------------------------------------------------------------------------- */

/**
 * D1: "No JWT in localStorage". The 15-minute access token lives in a module
 * variable and dies with the tab; the 7-day refresh token is an HttpOnly cookie
 * the browser sends automatically and JavaScript cannot read.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/* -------------------------------------------------------------------------- */
/*  Refresh                                                                   */
/* -------------------------------------------------------------------------- */

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
  user: unknown;
}

/** Concurrent 401s share one refresh instead of stampeding the endpoint. */
let refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        setAccessToken(null);
        return null;
      }

      const data = (await response.json()) as RefreshResponse;
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/* -------------------------------------------------------------------------- */
/*  Request                                                                   */
/* -------------------------------------------------------------------------- */

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set false on auth endpoints so a 401 is reported rather than retried. */
  retryOnUnauthorized?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, retryOnUnauthorized = true, headers, ...rest } = options;

  const send = async (token: string | null): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      // Always send the refresh cookie so /auth/refresh and /auth/logout work.
      credentials: 'include',
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

  let response = await send(accessToken);

  // The access token lasts 15 minutes, so this is the normal path on a page
  // that has been open a while - refresh once, then replay the request.
  if (response.status === 401 && retryOnUnauthorized) {
    const token = await refreshAccessToken();
    if (token) response = await send(token);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`;
  let fieldErrors: ApiFieldError[] = [];

  try {
    const payload = (await response.json()) as {
      message?: string;
      errors?: ApiFieldError[];
    };
    if (payload.message) message = payload.message;
    if (Array.isArray(payload.errors)) fieldErrors = payload.errors;
  } catch {
    // A non-JSON body (a proxy error page, say) keeps the default message.
  }

  return new ApiError(message, response.status, fieldErrors);
}

export const API_BASE_URL = API_URL;
