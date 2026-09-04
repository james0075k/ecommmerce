'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { COUPON_TYPES, CouponType, couponInputSchema } from '@bazaar/shared';
import type { AdminCouponListItem, CouponInput } from '@bazaar/shared';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Switch } from '@/components/ui/switch';
import { adminKeys } from '@/lib/admin';
import { ApiError, apiFetch } from '@/lib/api';
import type { CategoryNode } from '@/lib/catalog';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<CouponType, string> = {
  PERCENTAGE: 'Percentage off',
  FIXED: 'Fixed amount off',
  FREE_SHIPPING: 'Free shipping',
};

interface FormState {
  code: string;
  type: CouponType;
  value: string;
  minOrderAmount: string;
  maxDiscountAmount: string;
  usageLimit: string;
  perUserLimit: string;
  validFrom: string;
  validUntil: string;
  applicableCategories: string[];
  isActive: boolean;
}

/**
 * Create and edit a coupon.
 *
 * Numeric inputs are held as strings and converted once on submit. Storing them
 * as numbers means an empty field has to be represented as `NaN` or `0`, and
 * both lie: `0` is a real minimum order value and `NaN` renders as nothing while
 * failing every comparison silently.
 *
 * Validation runs through the same Zod schema the API uses, so the rules the
 * form enforces cannot drift from the rules the server enforces - including the
 * cross-field ones ("valid until must be after valid from") that a per-input
 * check cannot express.
 */
export function CouponFormDialog({
  coupon,
  open,
  onOpenChange,
}: {
  /** Null to create. */
  coupon: AdminCouponListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const editing = coupon !== null;

  const [form, setForm] = React.useState<FormState>(() => initialState(coupon));
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Re-seeded whenever the dialog opens on a different coupon; keying on `open`
  // too resets a half-typed form rather than leaving yesterday's draft in it.
  React.useEffect(() => {
    if (open) {
      setForm(initialState(coupon));
      setErrors({});
    }
  }, [open, coupon?.id]);

  const { data: categories } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => apiFetch<CategoryNode[]>('/categories?includeInactive=true'),
    staleTime: 600_000,
    enabled: open,
  });

  const save = useMutation({
    mutationFn: (input: CouponInput) =>
      apiFetch(editing ? `/admin/coupons/${coupon.id}` : '/admin/coupons', {
        method: editing ? 'PATCH' : 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.coupons.all });
      toast.success(editing ? `${form.code} updated.` : `${form.code} created.`);
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        setErrors(
          Object.fromEntries(error.fieldErrors.map((field) => [field.field, field.message])),
        );
        toast.error('Some fields need fixing.');
        return;
      }
      toast.error(error instanceof ApiError ? error.message : 'The coupon could not be saved.');
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const candidate = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      // A free-shipping coupon has no amount to enter, so the field is hidden
      // and the value fixed at zero rather than left to whatever was typed
      // before the type was switched.
      value: form.type === CouponType.FREE_SHIPPING ? 0 : Number(form.value || 0),
      minOrderAmount: optionalNumber(form.minOrderAmount),
      maxDiscountAmount: optionalNumber(form.maxDiscountAmount),
      usageLimit: optionalNumber(form.usageLimit),
      perUserLimit: optionalNumber(form.perUserLimit),
      validFrom: form.validFrom ? new Date(form.validFrom) : new Date(),
      validUntil: form.validUntil ? new Date(form.validUntil) : new Date(),
      applicableCategories: form.applicableCategories,
      applicableProducts: [],
      isActive: form.isActive,
    };

    const parsed = couponInputSchema.safeParse(candidate);

    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.') || 'code', issue.message]),
        ),
      );
      return;
    }

    setErrors({});
    save.mutate(parsed.data);
  };

  const flat = React.useMemo(() => flatten(categories ?? []), [categories]);
  const lockedCode = editing && coupon.usedCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${coupon.code}` : 'New coupon'}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Redeemed ${coupon.usedCount} time${coupon.usedCount === 1 ? '' : 's'}.`
              : 'Shoppers enter this code at checkout.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="coupon-code" error={errors.code}>
              <Input
                id="coupon-code"
                value={form.code}
                disabled={lockedCode}
                onChange={(event) =>
                  setForm((state) => ({ ...state, code: event.target.value.toUpperCase() }))
                }
                placeholder="DASHAIN500"
                className="numeric uppercase"
                maxLength={40}
              />
              {lockedCode ? (
                <p className="text-xs text-muted-foreground">
                  This code has been redeemed, so it cannot be renamed. Disable it and create a
                  new one instead.
                </p>
              ) : null}
            </Field>

            <Field label="Type" htmlFor="coupon-type" error={errors.type}>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm((state) => ({ ...state, type: value as CouponType }))
                }
              >
                <SelectTrigger id="coupon-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUPON_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {form.type !== CouponType.FREE_SHIPPING ? (
              <Field
                label={form.type === CouponType.PERCENTAGE ? 'Percentage off' : 'Amount off (Rs)'}
                htmlFor="coupon-value"
                error={errors.value}
              >
                <Input
                  id="coupon-value"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={form.type === CouponType.PERCENTAGE ? 100 : undefined}
                  value={form.value}
                  onChange={(event) => setForm((state) => ({ ...state, value: event.target.value }))}
                />
              </Field>
            ) : null}

            <Field
              label="Minimum order (Rs)"
              htmlFor="coupon-min"
              error={errors.minOrderAmount}
              hint="Leave blank for no minimum."
            >
              <Input
                id="coupon-min"
                type="number"
                inputMode="decimal"
                min={0}
                value={form.minOrderAmount}
                onChange={(event) =>
                  setForm((state) => ({ ...state, minOrderAmount: event.target.value }))
                }
              />
            </Field>

            {form.type === CouponType.PERCENTAGE ? (
              <Field
                label="Maximum discount (Rs)"
                htmlFor="coupon-max"
                error={errors.maxDiscountAmount}
                hint="Caps what a percentage can be worth on a large order."
              >
                <Input
                  id="coupon-max"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={form.maxDiscountAmount}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, maxDiscountAmount: event.target.value }))
                  }
                />
              </Field>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Total redemptions"
              htmlFor="coupon-limit"
              error={errors.usageLimit}
              hint="Blank for unlimited."
            >
              <Input
                id="coupon-limit"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.usageLimit}
                onChange={(event) =>
                  setForm((state) => ({ ...state, usageLimit: event.target.value }))
                }
              />
            </Field>

            <Field
              label="Per customer"
              htmlFor="coupon-per-user"
              error={errors.perUserLimit}
              hint="Blank for unlimited."
            >
              <Input
                id="coupon-per-user"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.perUserLimit}
                onChange={(event) =>
                  setForm((state) => ({ ...state, perUserLimit: event.target.value }))
                }
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valid from" htmlFor="coupon-from" error={errors.validFrom}>
              <Input
                id="coupon-from"
                type="datetime-local"
                value={form.validFrom}
                onChange={(event) =>
                  setForm((state) => ({ ...state, validFrom: event.target.value }))
                }
              />
            </Field>

            <Field label="Valid until" htmlFor="coupon-until" error={errors.validUntil}>
              <Input
                id="coupon-until"
                type="datetime-local"
                value={form.validUntil}
                onChange={(event) =>
                  setForm((state) => ({ ...state, validUntil: event.target.value }))
                }
              />
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Applies to</legend>
            <p className="text-xs text-muted-foreground">
              Leave everything unticked and the coupon applies to the whole catalog.
            </p>

            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {flat.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">Loading categories…</p>
              ) : (
                flat.map((category) => (
                  <label
                    key={category.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                    style={{ paddingLeft: `${0.375 + category.depth * 1}rem` }}
                  >
                    <Checkbox
                      checked={form.applicableCategories.includes(category.id)}
                      onCheckedChange={(checked) =>
                        setForm((state) => ({
                          ...state,
                          applicableCategories: checked
                            ? [...state.applicableCategories, category.id]
                            : state.applicableCategories.filter((id) => id !== category.id),
                        }))
                      }
                    />
                    <span className={cn(category.depth === 0 && 'font-medium')}>
                      {category.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </fieldset>

          <label className="flex items-center justify-between rounded-md border border-border p-3">
            <span>
              <span className="block text-sm font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">
                Turn off to stop the code working without deleting it.
              </span>
            </span>
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => setForm((state) => ({ ...state, isActive: checked }))}
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="gap-1.5">
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              {editing ? 'Save changes' : 'Create coupon'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function initialState(coupon: AdminCouponListItem | null): FormState {
  if (!coupon) {
    const from = new Date();
    const until = new Date();
    until.setMonth(until.getMonth() + 1);

    return {
      code: '',
      type: CouponType.PERCENTAGE,
      value: '10',
      minOrderAmount: '',
      maxDiscountAmount: '',
      usageLimit: '',
      perUserLimit: '1',
      validFrom: toLocalInput(from),
      validUntil: toLocalInput(until),
      applicableCategories: [],
      isActive: true,
    };
  }

  return {
    code: coupon.code,
    type: coupon.type,
    value: String(coupon.value),
    minOrderAmount: coupon.minOrderAmount === null ? '' : String(coupon.minOrderAmount),
    maxDiscountAmount: coupon.maxDiscountAmount === null ? '' : String(coupon.maxDiscountAmount),
    usageLimit: coupon.usageLimit === null ? '' : String(coupon.usageLimit),
    perUserLimit: coupon.perUserLimit === null ? '' : String(coupon.perUserLimit),
    validFrom: toLocalInput(new Date(coupon.validFrom)),
    validUntil: toLocalInput(new Date(coupon.validUntil)),
    applicableCategories: coupon.applicableCategories,
    isActive: coupon.isActive,
  };
}

/**
 * `datetime-local` wants a local-time string with no zone. `toISOString()`
 * returns UTC, which in Nepal (+05:45) shifts every value the operator typed by
 * nearly six hours - so the offset is subtracted before slicing.
 */
function toLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** An empty field is "no limit", which is null - never zero. */
function optionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

interface FlatCategory {
  id: string;
  name: string;
  depth: number;
}

function flatten(nodes: CategoryNode[], depth = 0): FlatCategory[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, depth },
    ...flatten(node.children ?? [], depth + 1),
  ]);
}
