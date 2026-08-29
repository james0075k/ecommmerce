'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { resetPasswordSchema } from '@bazaar/shared';
import type { ResetPasswordInput } from '@bazaar/shared';

import { AuthCard, AuthError } from '@/components/auth/auth-card';
import { PasswordStrength } from '@/components/auth/password-strength';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: values,
        retryOnUnauthorized: false,
      });
      toast.success('Password changed. Log in with your new password.');
      router.push('/login');
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not reset your password. Try again.',
      );
    }
  });

  if (!token) {
    return (
      <AuthCard
        title="This link is not valid"
        description="Reset links expire after an hour and can only be used once."
        footer={
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Open the most recent email we sent you, or request a fresh link.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="Once you save it, you'll be logged out everywhere else."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      <AuthError message={formError} />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <input type="hidden" {...register('token')} />

        <div className="grid gap-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.newPassword}
            className={cn(errors.newPassword && 'border-destructive')}
            {...register('newPassword')}
          />
          <PasswordStrength password={watch('newPassword')} />
          {errors.newPassword ? (
            <p className="text-sm text-destructive">{errors.newPassword.message}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            className={cn(errors.confirmPassword && 'border-destructive')}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword ? (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          ) : null}
        </div>

        <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSubmitting ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthCard>
  );
}
