'use client';

import { useEffect } from 'react';

import { useAuthStore } from '@/lib/store/auth-store';

/**
 * Restores the session on first paint by exchanging the HttpOnly refresh cookie
 * for an access token. Renders nothing itself - children mount immediately and
 * read `ready` from the store when they need to wait.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return children;
}
