'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { apiFetch, setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';
import type { SessionUser } from '@/lib/store/auth-store';

/**
 * Landing point for the Google OAuth redirect.
 *
 * The API has already set the HttpOnly refresh cookie and returned the access
 * token in the URL fragment - fragments are never sent to a server and never
 * land in logs. It is read once, stripped from history immediately, then
 * exchanged for the profile.
 */
export default function OAuthCallbackPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('access_token');

    // replaceState keeps the token out of the back button and the referrer.
    window.history.replaceState(null, '', window.location.pathname);

    if (!token) {
      router.replace('/login?error=google_failed');
      return;
    }

    setAccessToken(token);

    // Navigate straight from the async result - no intermediate state, which
    // would be a synchronous setState inside an effect.
    void apiFetch<SessionUser>('/auth/me')
      .then((user) => {
        setSession(user, token);
        router.replace('/account');
      })
      .catch(() => {
        setAccessToken(null);
        router.replace('/login?error=google_failed');
      });
  }, [router, setSession]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
