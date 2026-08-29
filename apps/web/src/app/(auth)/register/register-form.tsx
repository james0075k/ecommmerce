'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { registerSchema } from '@bazaar/shared';
import type { RegisterInput } from '@bazaar/shared';

import { AuthCard, AuthDivider, AuthError } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/oauth-buttons';
import { PasswordStrength } from '@/components/auth/password-strength';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';
import { cn } from '@/lib/utils';

export function RegisterForm() {
  const router = useRouter();
  const registerUser = useAuthStore((state) => state.register);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    // Validate as the user types once a field has been visited, so errors
    // appear while fixing them rather than only on submit.
    mode: 'onTouched',
    defaultValues: { fullName: '', email: '', phone: '', password: '', confirmPassword: '' },
  });

  const password = watch('password');
  const confirmPassword = watch('confirmPassword');

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      // An empty optional phone must not be sent as "" - it would fail the
      // schema's phone pattern.
      await registerUser({ ...values, phone: values.phone?.trim() || undefined });
      toast.success('Account created. Check your email to confirm the address.');
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const field of error.fieldErrors) {
          setError(field.field as keyof RegisterInput, { message: field.message });
        }
        setFormError(error.fieldErrors.length ? null : error.message);
        return;
      }
      setFormError('Could not reach the server. Check your connection and try again.');
    }
  });

  return (
    <AuthCard
      title="Create your account"
      description="Track orders, save addresses and keep a wishlist."
      footer={
        <span className="text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </span>
      }
    >
      <AuthError message={formError} />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          id="fullName"
          label="Full name"
          autoComplete="name"
          placeholder="Ramesh Shrestha"
          error={errors.fullName?.message}
          valid={!!touchedFields.fullName && !errors.fullName}
          {...register('fullName')}
        />

        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          valid={!!touchedFields.email && !errors.email}
          {...register('email')}
        />

        <Field
          id="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98XXXXXXXX"
          hint="Optional. Used for delivery updates and phone login."
          className="numeric"
          error={errors.phone?.message}
          valid={!!touchedFields.phone && !errors.phone && !!watch('phone')}
          {...register('phone')}
        />

        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            className={cn(errors.password && 'border-destructive')}
            {...register('password')}
          />
          <PasswordStrength password={password} />
          {errors.password ? (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          ) : null}
        </div>

        <Field
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          valid={!!confirmPassword && confirmPassword === password && !errors.confirmPassword}
          {...register('confirmPassword')}
        />

        <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSubmitting ? 'Creating your account…' : 'Create account'}
        </Button>

        <p className="text-xs text-muted-foreground">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="underline hover:text-foreground">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <AuthDivider />

      <GoogleButton disabled={isSubmitting} />
    </AuthCard>
  );
}

/** Input + label + inline error, with a tick once the field passes. */
const Field = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input> & {
    id: string;
    label: string;
    error?: string;
    valid?: boolean;
    hint?: string;
  }
>(function Field({ id, label, error, valid, hint, className, ...props }, ref) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(error && 'border-destructive', valid && 'pr-9', className)}
          {...props}
        />
        {valid ? (
          <Check className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-success" aria-hidden />
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
