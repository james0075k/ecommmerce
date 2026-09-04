'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { updateProfileSchema } from '@bazaar/shared';
import type { UpdateProfileInput } from '@bazaar/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';
import { cn } from '@/lib/utils';

export function ProfileTab() {
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await updateProfile({ ...values, phone: values.phone?.trim() || null });
      toast.success('Profile updated.');
      reset(values);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const field of error.fieldErrors) {
          setError(field.field as keyof UpdateProfileInput, { message: field.message });
        }
        setFormError(error.fieldErrors.length ? null : error.message);
        return;
      }
      setFormError('Could not save your changes. Try again.');
    }
  });

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Profile</CardTitle>
        <CardDescription>
          Changing your email or phone means confirming the new one before it can be used to log
          in.
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
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              aria-invalid={!!errors.fullName}
              className={cn(errors.fullName && 'border-destructive')}
              {...register('fullName')}
            />
            {errors.fullName ? (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="email">Email</Label>
              <VerifiedBadge verified={user.emailVerified} />
            </div>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              className={cn(errors.email && 'border-destructive')}
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="phone">Phone</Label>
              {user.phone ? <VerifiedBadge verified={user.phoneVerified} /> : null}
            </div>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
              aria-invalid={!!errors.phone}
              className={cn('numeric', errors.phone && 'border-destructive')}
              {...register('phone')}
            />
            {errors.phone ? (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Used for delivery updates and phone login.
              </p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge className="bg-success text-white">
      <BadgeCheck className="size-3" aria-hidden />
      Verified
    </Badge>
  ) : (
    <Badge variant="outline" className="text-caution">
      Not verified
    </Badge>
  );
}
