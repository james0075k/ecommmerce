'use client';

import * as React from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { forgotPasswordSchema } from '@bazaar/shared';
import type { ForgotPasswordInput } from '@bazaar/shared';

import { AuthCard, AuthError } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: values,
        retryOnUnauthorized: false,
      });
      // The API answers the same way whether or not the address is registered,
      // so this screen must not imply the account exists.
      setSentTo(values.email);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not send the email. Try again.',
      );
    }
  });

  if (sentTo) {
    return (
      <AuthCard
        title="Check your email"
        description={
          <>
            If <span className="text-foreground">{sentTo}</span> has an account, a reset link is
            on its way. The link works for one hour.
          </>
        }
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to log in
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Nothing after a few minutes? Check your spam folder, then{' '}
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="font-medium text-foreground underline"
            >
              try a different address
            </button>
            .
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new password."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
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
            {...register('email')}
          />
          {errors.email ? (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          ) : null}
        </div>

        <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthCard>
  );
}
