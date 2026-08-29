'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { addressInputSchema, DISTRICTS_BY_PROVINCE, NEPAL_PROVINCES } from '@bazaar/shared';
import type { AddressInput, NepalProvince } from '@bazaar/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Address extends AddressInput {
  id: string;
}

export function AddressesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Address | null>(null);
  const [open, setOpen] = React.useState(false);

  const { data: addresses, isPending } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => apiFetch<Address[]>('/users/addresses'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['addresses'] });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Address removed.');
      void invalidate();
    },
    onError: () => toast.error('Could not remove that address.'),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/users/addresses/${id}/default`, { method: 'PATCH' }),
    onSuccess: () => {
      toast.success('Default address updated.');
      void invalidate();
    },
    onError: () => toast.error('Could not update the default address.'),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="font-display">Addresses</CardTitle>
          <CardDescription>Where we deliver. Your default is used at checkout.</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </CardHeader>

      <CardContent>
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="bz-shimmer h-24 w-full" />
            <Skeleton className="bz-shimmer h-24 w-full" />
          </div>
        ) : !addresses?.length ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border py-10 text-center">
            <MapPin className="size-8 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium">No addresses yet</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Add one now to check out faster later.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Add your first address
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {addresses.map((address) => (
              <li
                key={address.id}
                className={cn(
                  'rounded-md border p-4',
                  address.isDefault ? 'border-primary/40 bg-accent/40' : 'border-border',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{address.label}</span>
                      {address.isDefault ? (
                        <Badge className="bg-primary text-primary-foreground">Default</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm">{address.fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      {address.street}, {address.city}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {address.district}, {address.province}
                      {address.postalCode ? ` ${address.postalCode}` : ''}
                    </p>
                    <p className="numeric mt-1 text-sm text-muted-foreground">{address.phone}</p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {!address.isDefault ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Make ${address.label} the default address`}
                        disabled={setDefault.isPending}
                        onClick={() => setDefault.mutate(address.id)}
                      >
                        <Star className="size-4" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${address.label}`}
                      onClick={() => {
                        setEditing(address);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${address.label}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(address.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AddressDialog
        open={open}
        onOpenChange={setOpen}
        address={editing}
        onSaved={() => {
          setOpen(false);
          void invalidate();
        }}
      />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function AddressDialog({
  open,
  onOpenChange,
  address,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: Address | null;
  onSaved: () => void;
}) {
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressInput>({
    resolver: zodResolver(addressInputSchema),
    defaultValues: {
      label: 'Home',
      fullName: '',
      phone: '',
      street: '',
      city: '',
      district: '',
      province: 'Bagmati',
      postalCode: '',
      country: 'Nepal',
      isDefault: false,
    },
  });

  // Reset whenever the dialog opens so editing one address never leaks into the
  // next "add".
  React.useEffect(() => {
    if (!open) return;

    reset(
      address ?? {
        label: 'Home',
        fullName: '',
        phone: '',
        street: '',
        city: '',
        district: '',
        province: 'Bagmati',
        postalCode: '',
        country: 'Nepal',
        isDefault: false,
      },
    );
    setFormError(null);
  }, [open, address, reset]);

  const province = watch('province') as NepalProvince;
  const district = watch('district');
  const districts = DISTRICTS_BY_PROVINCE[province] ?? [];

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (address) {
        await apiFetch(`/users/addresses/${address.id}`, { method: 'PATCH', body: values });
        toast.success('Address updated.');
      } else {
        await apiFetch('/users/addresses', { method: 'POST', body: values });
        toast.success('Address added.');
      }
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const field of error.fieldErrors) {
          setError(field.field as keyof AddressInput, { message: field.message });
        }
        setFormError(error.fieldErrors.length ? null : error.message);
        return;
      }
      setFormError('Could not save that address. Try again.');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            {address ? 'Edit address' : 'Add an address'}
          </DialogTitle>
          <DialogDescription>
            We deliver to all 77 districts. Pick the province first.
          </DialogDescription>
        </DialogHeader>

        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="label" label="Label" placeholder="Home" error={errors.label?.message} {...register('label')} />
            <TextField
              id="fullName"
              label="Recipient"
              placeholder="Ramesh Shrestha"
              error={errors.fullName?.message}
              {...register('fullName')}
            />
          </div>

          <TextField
            id="phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            placeholder="98XXXXXXXX"
            className="numeric"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <TextField
            id="street"
            label="Street address"
            placeholder="Ward 4, Jhamsikhel Marg"
            error={errors.street?.message}
            {...register('street')}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="province">Province</Label>
              <Select
                value={province}
                onValueChange={(value) => {
                  setValue('province', value as NepalProvince, { shouldValidate: true });
                  // The old district almost certainly is not in the new province.
                  setValue('district', '', { shouldValidate: false });
                }}
              >
                <SelectTrigger id="province">
                  <SelectValue placeholder="Select a province" />
                </SelectTrigger>
                <SelectContent>
                  {NEPAL_PROVINCES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="district">District</Label>
              <Select
                value={district || undefined}
                onValueChange={(value) =>
                  setValue('district', value, { shouldValidate: true })
                }
              >
                <SelectTrigger id="district" aria-invalid={!!errors.district}>
                  <SelectValue placeholder="Select a district" />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.district ? (
                <p className="text-sm text-destructive">{errors.district.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="city"
              label="City or municipality"
              placeholder="Lalitpur"
              error={errors.city?.message}
              {...register('city')}
            />
            <TextField
              id="postalCode"
              label="Postal code"
              placeholder="44700"
              className="numeric"
              error={errors.postalCode?.message}
              {...register('postalCode')}
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              {...register('isDefault')}
            />
            Use this as my default delivery address
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {address ? 'Save changes' : 'Add address'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const TextField = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input> & { id: string; label: string; error?: string }
>(function TextField({ id, label, error, className, ...props }, ref) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={ref}
        aria-invalid={!!error}
        className={cn(error && 'border-destructive', className)}
        {...props}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
});
