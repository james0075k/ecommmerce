/**
 * Cookie consent (Phase 12.10).
 *
 * Bazaar sets exactly two categories of client-side state:
 *
 *   necessary   the session cookie, the cart id, the theme. Not optional, not
 *               asked about, and not covered by any consent regime that
 *               matters here - the site does not work without them.
 *   analytics   PostHog: product analytics, feature flags and session replay.
 *               Third-party, persistent, and identifying. It does not load
 *               until this says so.
 *
 * The first-party page-view beacon in `analytics-provider.tsx` is deliberately
 * outside this: a random id in `sessionStorage` that dies with the tab is not
 * tracking, and gating it behind a banner would make the banner look like the
 * price of an honest measurement.
 *
 * The decision is exposed as an external store rather than as state copied into
 * an effect. `useSyncExternalStore` is what this API is for - see
 * `lib/hooks/use-consent.ts`.
 */

export type ConsentDecision = 'granted' | 'denied';

export interface ConsentState {
  analytics: ConsentDecision;
  /** When the decision was made. Consent is evidence, and evidence has a date. */
  decidedAt: string;
  /**
   * Bumped when the categories change. A stored decision from an older version
   * is treated as no decision, because it answered a different question.
   */
  version: number;
}

/**
 * What a reader sees.
 *
 *   'unknown'  server render and hydration - storage has not been read
 *   null       read, and no decision has been made: show the banner
 *   ConsentState  a decision
 *
 * The three-way split is the whole reason the banner does not flash on every
 * page load for someone who answered months ago.
 */
export type ConsentSnapshot = ConsentState | null | 'unknown';

export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = 'bz-consent';

/**
 * Fired on `window` when the decision changes. `storage` would not do on its
 * own: it fires only in *other* tabs, never the one that made the change.
 */
export const CONSENT_EVENT = 'bz:consent-changed';

/* --- The store ----------------------------------------------------------- */

/**
 * `getSnapshot` must return a referentially stable value or React re-renders
 * forever, and `readConsent()` parses JSON into a fresh object every call. This
 * is that cache; every mutation path invalidates it.
 */
let cached: ConsentState | null = null;
let cacheIsValid = false;

const listeners = new Set<() => void>();

function invalidate(): void {
  cacheIsValid = false;
  for (const listener of listeners) listener();
}

/** Reads and parses the stored decision. Prefer `getConsentSnapshot`. */
export function readConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed.version !== CONSENT_VERSION) return null;
    if (parsed.analytics !== 'granted' && parsed.analytics !== 'denied') return null;

    return {
      analytics: parsed.analytics,
      decidedAt: parsed.decidedAt ?? new Date().toISOString(),
      version: CONSENT_VERSION,
    };
  } catch {
    // Private browsing, a full quota, or a value someone edited by hand. Treat
    // an unreadable decision as no decision and ask again.
    return null;
  }
}

export function getConsentSnapshot(): ConsentSnapshot {
  if (!cacheIsValid) {
    cached = readConsent();
    cacheIsValid = true;
  }

  return cached;
}

/**
 * Storage is not readable while rendering on the server, and returning `null`
 * here would render the banner into the HTML for every visitor - including the
 * ones who declined a year ago, who would then see it flash and vanish.
 */
export function getConsentServerSnapshot(): ConsentSnapshot {
  return 'unknown';
}

export function subscribeToConsent(listener: () => void): () => void {
  listeners.add(listener);

  // A decision made in another tab should take effect here too: revoking
  // consent in one tab and leaving another recording would not be a withdrawal.
  const onStorage = (event: StorageEvent): void => {
    if (event.key === CONSENT_STORAGE_KEY || event.key === null) invalidate();
  };

  window.addEventListener(CONSENT_EVENT, listener);
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener(CONSENT_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

/* --- Mutations ----------------------------------------------------------- */

export function writeConsent(analytics: ConsentDecision): ConsentState {
  const state: ConsentState = {
    analytics,
    decidedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  };

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Refusing to record the choice must not stop us acting on it for this
    // session - the banner will simply reappear next visit.
  }

  invalidate();
  window.dispatchEvent(new Event(CONSENT_EVENT));
  return state;
}

/** Used by the "Cookie preferences" link in the footer. */
export function clearConsent(): void {
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }

  invalidate();
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
