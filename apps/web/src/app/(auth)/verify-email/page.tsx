'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api';

export default function VerifyEmailPage() {
  return (
    <React.Suspense fallback={null}>
      <VerifyEmail />
    </React.Suspense>
  );
}

type State = 'awaiting' | 'verifying' | 'verified' | 'failed';

/**
 * Serves two arrivals:
 *   - straight after registering (?email=...)  -> "check your inbox"
 *   - from the emailed link      (?token=...)  -> verify and confirm
 */
function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get('token');
  const email = params.get('email');

  const [state, setState] = React.useState<State>(token ? 'verifying' : 'awaiting');
  const [message, setMessage] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    apiFetch('/auth/verify-email', {
      method: 'POST',
      body: { token },
      retryOnUnauthorized: false,
      signal: controller.signal,
    })
      .then(() => setState('verified'))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMessage(
          error instanceof ApiError ? error.message : 'Could not verify this link.',
        );
        setState('failed');
      });

    return () => controller.abort();
  }, [token]);

  if (state === 'verifying') {
    return (
      <AuthCard title="Confirming your email" description="This only takes a moment.">
        <div className="flex justify-center py-6">
          <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Verifying</span>
        </div>
      </AuthCard>
    );
  }

  if (state === 'verified') {
    return (
      <AuthCard
        title="Your email is confirmed"
        description="Your account is ready. Log in to get started."
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <CheckCircle2 className="size-10 text-ok" aria-hidden />
          <Button asChild className="h-11 w-full">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (state === 'failed') {
    return (
      <AuthCard
        title="This link didn't work"
        description={message ?? 'Verification links expire after 24 hours.'}
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to log in
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <XCircle className="size-10 text-destructive" aria-hidden />
          <ResendButton email={email} resending={resending} setResending={setResending} />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Confirm your email"
      description={
        email ? (
          <>
            We sent a confirmation link to <span className="text-foreground">{email}</span>.
            Open it to finish setting up your account.
          </>
        ) : (
          'We sent you a confirmation link. Open it to finish setting up your account.'
        )
      }
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
          <p className="text-sm text-muted-foreground">
            The link works for 24 hours. Check your spam folder if it has not arrived.
          </p>
        </div>
        <ResendButton email={email} resending={resending} setResending={setResending} />
      </div>
    </AuthCard>
  );
}

function ResendButton({
  email,
  resending,
  setResending,
}: {
  email: string | null;
  resending: boolean;
  setResending: (value: boolean) => void;
}) {
  if (!email) return null;

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={resending}
      onClick={async () => {
        setResending(true);
        try {
          await apiFetch('/auth/resend-verification', {
            method: 'POST',
            body: { email },
            retryOnUnauthorized: false,
          });
          toast.success('If that account needs verifying, a new link is on its way.');
        } catch {
          toast.error('Could not send another link. Try again shortly.');
        } finally {
          setResending(false);
        }
      }}
    >
      {resending ? <Loader2 className="size-4 animate-spin" /> : null}
      {resending ? 'Sending…' : 'Send another link'}
    </Button>
  );
}
