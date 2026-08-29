'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { changePasswordSchema } from '@bazaar/shared';
import type { ChangePasswordInput } from '@bazaar/shared';

import { PasswordStrength } from '@/components/auth/password-strength';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';
import { cn } from '@/lib/utils';

export function SecurityTab() {
  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      <TwoFactorCard />
    </div>
  );
}

function ChangePasswordCard() {
  const changePassword = useAuthStore((state) => state.changePassword);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const result = await changePassword(values);
      toast.success(result.message);
      reset();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const field of error.fieldErrors) {
          setError(field.field as keyof ChangePasswordInput, { message: field.message });
        }
        setFormError(error.fieldErrors.length ? null : error.message);
        return;
      }
      setFormError('Could not change your password. Try again.');
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Password</CardTitle>
        <CardDescription>
          Changing it signs you out on every other device.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {formError ? (
          <p
            role="alert"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.currentPassword}
              className={cn(errors.currentPassword && 'border-destructive')}
              {...register('currentPassword')}
            />
            {errors.currentPassword ? (
              <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
            ) : null}
          </div>

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

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {isSubmitting ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TwoFactorCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Two-factor authentication</CardTitle>
        <CardDescription>
          An authenticator app code on top of your password.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium">TOTP authenticator</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                The schema already stores a TOTP secret; enrolment ships with the admin panel in
                Phase 8.
              </p>
            </div>
          </div>
          <Badge variant="outline">Not yet available</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
