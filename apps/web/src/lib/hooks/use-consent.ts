'use client';

import * as React from 'react';

import {
  getConsentServerSnapshot,
  getConsentSnapshot,
  subscribeToConsent,
  type ConsentSnapshot,
} from '@/lib/consent';

/**
 * Subscribes to the stored cookie decision (Phase 12.10).
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`, and not only
 * because the linter says so: it renders `'unknown'` during hydration and
 * switches to the real value in the same commit React uses to reconcile the
 * client tree. The effect version renders one extra frame with the wrong
 * answer, which for a banner is a visible flash on every page load.
 *
 * Returns `'unknown'` before storage has been read, `null` when no decision has
 * been made, and the decision otherwise.
 */
export function useConsent(): ConsentSnapshot {
  return React.useSyncExternalStore(
    subscribeToConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );
}

/** True only once a decision has been read and it grants analytics. */
export function useAnalyticsConsent(): boolean {
  const consent = useConsent();
  return consent !== 'unknown' && consent !== null && consent.analytics === 'granted';
}
