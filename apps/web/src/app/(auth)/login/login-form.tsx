'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { loginSchema, phoneLoginSchema, verifyOtpSchema } from '@bazaar/shared';
import type { LoginInput, PhoneLoginInput, VerifyOtpInput } from '@bazaar/shared';

import { AuthCard, AuthDivider, AuthError } from '@/components/auth/auth-card';
import { GoogleButton, PhoneButton } from '@/components/auth/oauth-buttons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';

type Mode = 'password' | 'phone' | 'otp';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = React.useState<Mode>('password');
  const [phone, setPhone] = React.useState('');

  // Where to land after login - set by middleware when it bounces a request.
  const next = params.get('next') ?? '/account';
  const oauthError = params.get('error');

  React.useEffect(() => {
    if (oauthError === 'google_failed') {
      toast.error('Google sign-in did not complete. Try again.');
    }
  }, [oauthError]);

  if (mode === 'phone') {
    return (
      <PhoneStep
        onBack={() => setMode('password')}
        onSent={(value) => {
          setPhone(value);
          setMode('otp');
        }}
      />
    );
  }

  if (mode === 'otp') {
    return <OtpStep phone={phone} next={next} onBack={() => setMode('phone')} />;
  }

  return <PasswordStep next={next} onUsePhone={() => setMode('phone')} router={router} />;
}

/* -------------------------------------------------------------------------- */
/*  Step 1 - email + password                                                 */
/* -------------------------------------------------------------------------- */

function PasswordStep({
  next,
  onUsePhone,
  router,
}: {
  next: string;
  onUsePhone: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const login = useAuthStore((state) => state.login);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}.`);
      router.push(next);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const field of error.fieldErrors) {
          setError(field.field as keyof LoginInput, { message: field.message });
        }
        setFormError(error.fieldErrors.length ? null : error.message);
        return;
      }
      setFormError('Could not reach the server. Check your connection and try again.');
    }
  });

  return (
    <AuthCard
      title="Log in"
      description="Welcome back. Pick up where you left off."
      footer={
        <span className="text-muted-foreground">
          New here?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </span>
      }
    >
      <AuthError message={formError} />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email ? (
            <p id="email-error" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          {errors.password ? (
            <p id="password-error" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        {/* h-11 keeps the primary action above the 44px touch target minimum. */}
        <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <AuthDivider />

      <div className="space-y-2.5">
        <GoogleButton disabled={isSubmitting} />
        <PhoneButton onClick={onUsePhone} disabled={isSubmitting} />
      </div>
    </AuthCard>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 2 - request an OTP                                                   */
/* -------------------------------------------------------------------------- */

function PhoneStep({
  onBack,
  onSent,
}: {
  onBack: () => void;
  onSent: (phone: string) => void;
}) {
  const requestOtp = useAuthStore((state) => state.requestOtp);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PhoneLoginInput>({
    resolver: zodResolver(phoneLoginSchema),
    defaultValues: { phone: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await requestOtp(values.phone);
      toast.success('Code sent. It expires in 5 minutes.');
      onSent(values.phone);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not send the code. Try again.',
      );
    }
  });

  return (
    <AuthCard
      title="Log in with your phone"
      description="We'll text you a 6-digit code. No password needed."
      footer={<BackLink onClick={onBack} label="Back to email login" />}
    >
      <AuthError message={formError} />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="phone">Mobile number</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98XXXXXXXX"
            className="numeric"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'phone-error' : undefined}
            {...register('phone')}
          />
          {errors.phone ? (
            <p id="phone-error" className="text-sm text-destructive">
              {errors.phone.message}
            </p>
          ) : null}
        </div>

        <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSubmitting ? 'Sending…' : 'Send code'}
        </Button>
      </form>
    </AuthCard>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 3 - verify the OTP                                                   */
/* -------------------------------------------------------------------------- */

function OtpStep({ phone, next, onBack }: { phone: string; next: string; onBack: () => void }) {
  const router = useRouter();
  const verifyOtp = useAuthStore((state) => state.verifyOtp);
  const requestOtp = useAuthStore((state) => state.requestOtp);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(60);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VerifyOtpInput>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { phone, otp: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const user = await verifyOtp(phone, values.otp);
      toast.success(`Signed in as ${user.phone ?? user.fullName}.`);
      router.push(next);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Could not verify that code.');
    }
  });

  return (
    <AuthCard
      title="Enter your code"
      description={
        <>
          We sent a 6-digit code to <span className="numeric text-foreground">{phone}</span>.
        </>
      }
      footer={<BackLink onClick={onBack} label="Use a different number" />}
    >
      <AuthError message={formError} />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <input type="hidden" {...register('phone')} />

        <div className="grid gap-2">
          <Label htmlFor="otp">Verification code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="numeric text-center text-lg tracking-[0.4em]"
            aria-invalid={!!errors.otp}
            aria-describedby={errors.otp ? 'otp-error' : undefined}
            {...register('otp')}
          />
          {errors.otp ? (
            <p id="otp-error" className="text-sm text-destructive">
              {errors.otp.message}
            </p>
          ) : null}
        </div>

        <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSubmitting ? 'Verifying…' : 'Verify and log in'}
        </Button>
      </form>

      <button
        type="button"
        disabled={cooldown > 0}
        onClick={async () => {
          try {
            await requestOtp(phone);
            setCooldown(60);
            toast.success('New code sent.');
          } catch (error) {
            setFormError(
              error instanceof ApiError ? error.message : 'Could not resend the code.',
            );
          }
        }}
        className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
      </button>
    </AuthCard>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {label}
    </button>
  );
}
