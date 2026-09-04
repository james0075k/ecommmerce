'use client';

import * as React from 'react';

/**
 * Registers the service worker once, after the page has settled.
 *
 * Registration is deferred to the `load` event: it kicks off a network request
 * and a precache, and doing that while the page is still painting competes with
 * the very content the worker exists to make fast.
 *
 * Development is skipped deliberately - a worker caching a dev bundle is the
 * classic "why is my edit not showing" bug - and any worker left over from a
 * previous production visit is unregistered on the way past.
 */
export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => undefined);
      return;
    }

    const register = () => {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          // A failed registration costs the offline page, nothing else - the
          // app works exactly as it did before, so this is not worth a toast.
        });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
