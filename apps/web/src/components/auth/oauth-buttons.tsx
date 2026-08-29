'use client';

import { Smartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/lib/api';

/** Google's mark. Inline so it survives the artifact CSP and never 404s. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.56Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.55-2.03-6.46-4.76H1.7v2.98A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.54 14.66a7.2 7.2 0 0 1 0-4.6V7.08H1.7a12 12 0 0 0 0 10.56l3.84-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.2 15.1 0 12 0 7.44 0 3.5 2.62 1.7 6.42l3.84 2.98C6.45 6.78 9 4.75 12 4.75Z"
      />
    </svg>
  );
}

/**
 * Google sign-in is a full-page navigation, not fetch: the OAuth handshake ends
 * with the API setting the refresh cookie and redirecting back to /auth/callback.
 */
export function GoogleButton({ disabled }: { disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={disabled}
      onClick={() => {
        // A real cross-origin navigation to the API host, not an internal route:
        // the OAuth handshake has to leave the Next app entirely, so router.push
        // would be wrong here. The rule cannot tell that API_BASE_URL is external.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `${API_BASE_URL}/auth/google`;
      }}
    >
      <GoogleMark />
      Continue with Google
    </Button>
  );
}

export function PhoneButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick} disabled={disabled}>
      <Smartphone className="size-4" />
      Continue with a phone code
    </Button>
  );
}
