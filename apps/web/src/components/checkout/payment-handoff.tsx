'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useTheme } from 'next-themes';

import type { PaymentInit } from '@bazaar/shared';

import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/lib/api';

/**
 * Hands the browser over to whichever gateway the shopper chose.
 *
 * It switches on `payment.kind`, not on the payment method - the server already
 * reduced eight gateways to four client behaviours, so a ninth redirect-style
 * gateway needs no change here at all.
 */
export function PaymentHandoff({
  payment,
  orderId,
}: {
  payment: PaymentInit;
  orderId: string;
}) {
  switch (payment.kind) {
    case 'form_post':
      return <FormPostHandoff payment={payment} />;
    case 'redirect':
      return <RedirectHandoff payment={payment} />;
    case 'client_sdk':
      return <StripeHandoff payment={payment} orderId={orderId} />;
    case 'qr':
      return <QrHandoff payment={payment} />;
    case 'none':
      return null;
  }
}

/* -------------------------------------------------------------------------- */

/**
 * eSewa needs a real form POST with its fields in its own order, so the form is
 * rendered and submitted rather than fetched - a `fetch` would follow the
 * redirect server-side and never show the shopper eSewa's login.
 */
function FormPostHandoff({ payment }: { payment: Extract<PaymentInit, { kind: 'form_post' }> }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const submitted = React.useRef(false);

  React.useEffect(() => {
    // React 18+ mounts effects twice in development; without this guard the
    // form submits, navigates, and the shopper sees a flash of a double post.
    if (submitted.current) return;
    submitted.current = true;
    formRef.current?.submit();
  }, []);

  return (
    <Handing label={`Taking you to ${payment.method === 'ESEWA' ? 'eSewa' : payment.method}…`}>
      <form ref={formRef} action={payment.actionUrl} method="POST" className="hidden">
        {Object.entries(payment.fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} readOnly />
        ))}
      </form>

      {/* A manual fallback for anyone whose browser blocked the auto-submit. */}
      <Button variant="outline" size="sm" onClick={() => formRef.current?.submit()}>
        Continue manually
      </Button>
    </Handing>
  );
}

function RedirectHandoff({ payment }: { payment: Extract<PaymentInit, { kind: 'redirect' }> }) {
  const redirected = React.useRef(false);

  React.useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;
    window.location.href = payment.redirectUrl;
  }, [payment.redirectUrl]);

  return (
    <Handing label="Taking you to the payment page…">
      <Button variant="outline" size="sm" asChild>
        <a href={payment.redirectUrl}>Continue manually</a>
      </Button>
    </Handing>
  );
}

/* -------------------------------------------------------------------------- */

/** Cached per publishable key - `loadStripe` injects a script tag each call. */
const stripeCache = new Map<string, Promise<Stripe | null>>();

function stripeFor(key: string): Promise<Stripe | null> {
  let promise = stripeCache.get(key);

  if (!promise) {
    promise = loadStripe(key);
    stripeCache.set(key, promise);
  }

  return promise;
}

function StripeHandoff({
  payment,
  orderId,
}: {
  payment: Extract<PaymentInit, { kind: 'client_sdk' }>;
  orderId: string;
}) {
  const { resolvedTheme } = useTheme();

  if (!payment.publishableKey) {
    return (
      <p role="alert" className="text-sm text-destructive text-pretty">
        Card payments are not fully configured on this server —
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing. Choose another payment method.
      </p>
    );
  }

  return (
    <Elements
      stripe={stripeFor(payment.publishableKey)}
      options={{
        clientSecret: payment.clientSecret,
        appearance: {
          theme: resolvedTheme === 'dark' ? 'night' : 'stripe',
          variables: { colorPrimary: '#6C3CE1', borderRadius: '10px' },
        },
      }}
    >
      <StripeForm orderId={orderId} paymentId={payment.paymentId} />
    </Elements>
  );
}

function StripeForm({ orderId, paymentId }: { orderId: string; paymentId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    // `if_required` keeps a plain card on this page instead of bouncing through
    // a return URL; only 3-D Secure actually navigates away.
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${API_BASE_URL}/payments/stripe/return?paymentId=${paymentId}`,
      },
      redirect: 'if_required',
    });

    if (result.error) {
      setError(result.error.message ?? 'That card was declined.');
      setSubmitting(false);
      return;
    }

    // The webhook is the authority on the order status; this navigation just
    // gets the shopper to the page that will show it.
    router.push(`/orders/${orderId}/confirmation`);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />

      {error ? (
        <p role="alert" className="text-sm text-destructive text-pretty">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={!stripe || submitting}>
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {submitting ? 'Confirming…' : 'Pay now'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Card details go straight to Stripe. They never touch our servers.
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Fonepay: the shopper scans and pays in their bank's app, so nothing navigates
 * back. The page polls the API, which asks Fonepay each time.
 */
function QrHandoff({ payment }: { payment: Extract<PaymentInit, { kind: 'qr' }> }) {
  const router = useRouter();
  const [expired, setExpired] = React.useState(false);

  React.useEffect(() => {
    const deadline = new Date(payment.expiresAt).getTime();

    const timer = setInterval(() => {
      if (Date.now() > deadline) {
        setExpired(true);
        clearInterval(timer);
        return;
      }

      void fetch(payment.statusUrl, { credentials: 'include' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { status?: string; orderId?: string } | null) => {
          if (data?.status === 'COMPLETED' && data.orderId) {
            clearInterval(timer);
            router.push(`/orders/${data.orderId}/confirmation`);
          }
        })
        .catch(() => undefined);
    }, 3000);

    return () => clearInterval(timer);
  }, [payment.statusUrl, payment.expiresAt, router]);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="rounded-md border border-border bg-white p-3">
        <Image
          src={payment.qrImage}
          alt="Fonepay payment QR code"
          width={240}
          height={240}
          unoptimized
          className={expired ? 'opacity-30' : undefined}
        />
      </div>

      {expired ? (
        <p role="alert" className="text-sm text-destructive text-pretty">
          This QR code has expired. Go back and start the payment again.
        </p>
      ) : (
        <>
          <p className="text-sm text-pretty">
            Scan with any bank app that supports Fonepay. This page updates itself once
            the payment lands.
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Waiting for payment…
          </p>
        </>
      )}
    </div>
  );
}

function Handing({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground text-pretty">
        Do not close this window — you will come back here automatically.
      </p>
      {children}
    </div>
  );
}
