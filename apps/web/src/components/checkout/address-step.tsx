'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, MapPin, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';

import {
  addressInputSchema,
  DEFAULT_COUNTRY,
  DISTRICTS_BY_PROVINCE,
  NEPAL_DISTRICTS,
  NEPAL_PROVINCES,
} from '@bazaar/shared';
import type { AddressInput, NepalProvince } from '@bazaar/shared';

import { Button } from '@/components/ui/button';
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
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCheckoutStore } from '@/lib/store/checkout-store';
import { cn } from '@/lib/utils';

interface SavedAddress extends AddressInput {
  id: string;
}

/** Province lookup, so choosing a district fills the province in for you. */
const PROVINCE_BY_DISTRICT = new Map(
  NEPAL_DISTRICTS.map((district) => [district.name, district.province]),
);

/**
 * Step 1 - where it goes.
 *
 * Nepal-specific: the district is the field that matters. It determines the
 * shipping zone and it is what a courier actually routes on, so it is a real
 * dropdown of all 77 rather than free text, and picking one sets the province
 * automatically - the mapping is one-to-one and asking twice invites a
 * mismatch no courier could resolve.
 */
export function AddressStep() {
  const user = useAuthStore((state) => state.user);
  const savedAddressId = useCheckoutStore((state) => state.savedAddressId);
  const address = useCheckoutStore((state) => state.address);
  const setSavedAddress = useCheckoutStore((state) => state.setSavedAddress);
  const next = useCheckoutStore((state) => state.next);

  const { data: saved, isPending } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => apiFetch<SavedAddress[]>('/users/addresses'),
    enabled: !!user,
  });

  const hasSaved = !!saved && saved.length > 0;

  // An explicit "I want to type a different one", rather than a mode that has
  // to be kept in sync with the data. `mode` is then derived, so there is no
  // second source of truth for which panel is open.
  const [wantsNew, setWantsNew] = React.useState(false);
  const mode: 'saved' | 'new' = wantsNew || !hasSaved ? 'new' : 'saved';

  // Preselects the default address. This writes to the checkout store - an
  // external system - which is what an effect is for; it sets no local state.
  React.useEffect(() => {
    if (!saved || saved.length === 0 || address) return;

    const preferred = saved.find((entry) => entry.isDefault) ?? saved[0];
    if (preferred) setSavedAddress(preferred.id, preferred);
  }, [saved, address, setSavedAddress]);

  return (
    <div className="space-y-6">
      {user && isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {hasSaved ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Deliver to a saved address</h2>

          <ul className="grid gap-3 sm:grid-cols-2">
            {saved.map((entry) => {
              const selected = mode === 'saved' && savedAddressId === entry.id;

              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSavedAddress(entry.id, entry);
                      setWantsNew(false);
                    }}
                    aria-pressed={selected}
                    className={cn(
                      'relative w-full rounded-md border p-4 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/40',
                    )}
                  >
                    {selected ? (
                      <Check className="absolute top-3 right-3 size-4 text-primary" aria-hidden />
                    ) : null}

                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
                      {entry.label}
                    </p>
                    <p className="mt-1.5 text-sm">{entry.fullName}</p>
                    <p className="text-sm text-muted-foreground text-pretty">
                      {entry.street}, {entry.city}
                      <br />
                      {entry.district}, {entry.province}
                    </p>
                    <p className="numeric mt-1 text-xs text-muted-foreground">{entry.phone}</p>
                  </button>
                </li>
              );
            })}
          </ul>

          {mode === 'saved' ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setWantsNew(true)}>
                <Plus className="size-3.5" />
                Use a different address
              </Button>
              <Button size="sm" onClick={next} disabled={!address}>
                Continue to shipping
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === 'new' ? (
        <NewAddressForm hasSaved={hasSaved} onCancel={() => setWantsNew(false)} />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function NewAddressForm({
  hasSaved,
  onCancel,
}: {
  hasSaved: boolean;
  onCancel: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const address = useCheckoutStore((state) => state.address);
  const savedAddressId = useCheckoutStore((state) => state.savedAddressId);
  const setAddress = useCheckoutStore((state) => state.setAddress);
  const guestEmail = useCheckoutStore((state) => state.guestEmail);
  const setGuestEmail = useCheckoutStore((state) => state.setGuestEmail);
  const next = useCheckoutStore((state) => state.next);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AddressInput>({
    resolver: zodResolver(addressInputSchema),
    defaultValues: {
      label: 'Home',
      country: DEFAULT_COUNTRY,
      isDefault: false,
      // A saved address chosen earlier should not prefill the "different
      // address" form - that is the one case where the shopper wants a blank.
      ...(savedAddressId ? {} : (address ?? {})),
    },
  });

  const province = watch('province');
  const district = watch('district');

  const districts = province
    ? DISTRICTS_BY_PROVINCE[province as NepalProvince]
    : NEPAL_DISTRICTS.map((entry) => entry.name);

  const [emailError, setEmailError] = React.useState<string | null>(null);

  const onSubmit = (values: AddressInput) => {
    // A guest has no account email, so the receipt has nowhere to go without it.
    if (!user && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) {
      setEmailError('Enter a valid email address so we can send your receipt.');
      return;
    }

    setEmailError(null);
    setAddress(values);
    next();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-sm font-medium">
        {hasSaved ? 'Or enter a new address' : 'Delivery address'}
      </h2>

      {!user ? (
        <Field label="Email address" error={emailError} htmlFor="guest-email">
          <Input
            id="guest-email"
            type="email"
            value={guestEmail}
            onChange={(event) => setGuestEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={!!emailError}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            We send your order confirmation and tracking link here.
          </p>
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Recipient name" error={errors.fullName?.message} htmlFor="fullName">
          <Input id="fullName" {...register('fullName')} autoComplete="name" />
        </Field>

        <Field label="Phone" error={errors.phone?.message} htmlFor="phone">
          <Input id="phone" {...register('phone')} autoComplete="tel" placeholder="98XXXXXXXX" />
        </Field>
      </div>

      <Field label="Street address" error={errors.street?.message} htmlFor="street">
        <Input
          id="street"
          {...register('street')}
          autoComplete="street-address"
          placeholder="Ward, tole, house number"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City / municipality" error={errors.city?.message} htmlFor="city">
          <Input id="city" {...register('city')} autoComplete="address-level2" />
        </Field>

        <Field label="District" error={errors.district?.message}>
          <Select
            value={district}
            onValueChange={(value) => {
              setValue('district', value as AddressInput['district'], {
                shouldValidate: true,
              });

              // One district belongs to exactly one province, so filling it in
              // removes a question the shopper could only get wrong.
              const owning = PROVINCE_BY_DISTRICT.get(value);
              if (owning) {
                setValue('province', owning, { shouldValidate: true });
              }
            }}
          >
            <SelectTrigger aria-invalid={!!errors.district}>
              <SelectValue placeholder="Select district" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {districts.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Province" error={errors.province?.message}>
          <Select
            value={province}
            onValueChange={(value) => {
              setValue('province', value as NepalProvince, { shouldValidate: true });
              // Changing province invalidates a district from another one.
              if (district && !DISTRICTS_BY_PROVINCE[value as NepalProvince]?.includes(district)) {
                setValue('district', '' as AddressInput['district']);
              }
            }}
          >
            <SelectTrigger aria-invalid={!!errors.province}>
              <SelectValue placeholder="Select province" />
            </SelectTrigger>
            <SelectContent>
              {NEPAL_PROVINCES.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Postal code (optional)" htmlFor="postalCode">
          <Input id="postalCode" {...register('postalCode')} autoComplete="postal-code" />
        </Field>

        <Field label="Address label" error={errors.label?.message} htmlFor="label">
          <Input id="label" {...register('label')} placeholder="Home, Office…" />
        </Field>
      </div>

      <input type="hidden" {...register('country')} />

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit">Continue to shipping</Button>
        {hasSaved ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
