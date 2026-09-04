'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Loader2,
  Mail,
  Percent,
  Plus,
  Save,
  Store,
  Trash2,
  Truck,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CARRIERS,
  NEPAL_DISTRICTS,
  NOTIFICATION_TEMPLATE_KEYS,
  PAYMENT_METHODS,
  TEMPLATE_VARIABLES,
} from '@bazaar/shared';
import type {
  MessageTemplate,
  NotificationTemplateKey,
  SettingsPatchInput,
  SettingsSection,
  ShippingZoneConfig,
  StoreSettings,
} from '@bazaar/shared';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { adminApi, adminKeys } from '@/lib/admin';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';
import { cn } from '@/lib/utils';

/**
 * Store settings.
 *
 * Saved per section, not per page. Two operators editing different tabs is a
 * normal Tuesday, and a whole-document save would have whoever clicks second
 * silently overwrite the first with the values their browser loaded minutes
 * earlier. Each tab's Save sends only its own section.
 *
 * Writing is restricted to SUPER_ADMIN by the API, so the form is read-only for
 * a plain admin rather than offering buttons that will 403.
 */
export function AdminSettingsView() {
  const role = useAuthStore((state) => state.user?.role);
  const canWrite = role === 'SUPER_ADMIN';

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: adminKeys.settings,
    queryFn: adminApi.settings,
    staleTime: 300_000,
  });

  const save = useMutation({
    mutationFn: (patch: SettingsPatchInput) =>
      apiFetch<StoreSettings>('/admin/settings', { method: 'PATCH', body: patch }),
    onSuccess: (updated, patch) => {
      queryClient.setQueryData(adminKeys.settings, updated);
      const section = Object.keys(patch)[0] ?? 'settings';
      toast.success(`${SECTION_LABELS[section as SettingsSection] ?? 'Settings'} saved.`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The settings could not be saved.');
    },
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {canWrite
            ? 'What these change is what every shopper is charged, so they save one section at a time.'
            : 'Read-only. Only a super admin can change store settings.'}
        </p>
      </header>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general" className="gap-1.5">
            <Store className="size-3.5" aria-hidden />
            Store
          </TabsTrigger>
          <TabsTrigger value="tax" className="gap-1.5">
            <Percent className="size-3.5" aria-hidden />
            Tax &amp; currency
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <CreditCard className="size-3.5" aria-hidden />
            Payments
          </TabsTrigger>
          <TabsTrigger value="shipping" className="gap-1.5">
            <Truck className="size-3.5" aria-hidden />
            Shipping
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Mail className="size-3.5" aria-hidden />
            Templates
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-1.5">
            <Wrench className="size-3.5" aria-hidden />
            Maintenance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSection settings={data} canWrite={canWrite} save={save} />
        </TabsContent>
        <TabsContent value="tax">
          <TaxSection settings={data} canWrite={canWrite} save={save} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsSection settings={data} canWrite={canWrite} save={save} />
        </TabsContent>
        <TabsContent value="shipping">
          <ShippingSection settings={data} canWrite={canWrite} save={save} />
        </TabsContent>
        <TabsContent value="notifications">
          <TemplatesSection settings={data} canWrite={canWrite} save={save} />
        </TabsContent>
        <TabsContent value="maintenance">
          <MaintenanceSection settings={data} canWrite={canWrite} save={save} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'Store details',
  currency: 'Currency',
  tax: 'Tax',
  shipping: 'Shipping',
  payments: 'Payments',
  social: 'Social links',
  maintenance: 'Maintenance mode',
  notifications: 'Templates',
};

type SaveMutation = ReturnType<typeof useMutation<StoreSettings, Error, SettingsPatchInput>>;

interface SectionProps {
  settings: StoreSettings;
  canWrite: boolean;
  save: SaveMutation;
}

function Panel({
  title,
  description,
  onSave,
  canWrite,
  saving,
  children,
}: {
  title: string;
  description: string;
  onSave: () => void;
  canWrite: boolean;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card sm:p-6">
      <header className="mb-5">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <fieldset disabled={!canWrite} className="space-y-5 disabled:opacity-70">
        {children}
      </fieldset>

      {canWrite ? (
        <div className="mt-6 flex justify-end border-t border-border pt-5">
          <Button onClick={onSave} disabled={saving} className="gap-1.5">
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            Save
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* --- Store details -------------------------------------------------------- */

function GeneralSection({ settings, canWrite, save }: SectionProps) {
  const [form, setForm] = React.useState(settings.general);
  const [social, setSocial] = React.useState(settings.social);

  return (
    <Panel
      title="Store details"
      description="The name, logo and contacts that appear across the storefront and on every email."
      canWrite={canWrite}
      saving={save.isPending}
      onSave={() => save.mutate({ general: form, social })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Store name" htmlFor="store-name">
          <Input
            id="store-name"
            value={form.name}
            onChange={(event) => setForm((state) => ({ ...state, name: event.target.value }))}
            maxLength={80}
          />
        </Field>

        <Field label="Tagline" htmlFor="store-tagline">
          <Input
            id="store-tagline"
            value={form.tagline ?? ''}
            onChange={(event) => setForm((state) => ({ ...state, tagline: event.target.value }))}
            maxLength={160}
          />
        </Field>

        <Field label="Support email" htmlFor="store-email">
          <Input
            id="store-email"
            type="email"
            value={form.contactEmail}
            onChange={(event) =>
              setForm((state) => ({ ...state, contactEmail: event.target.value }))
            }
          />
        </Field>

        <Field label="Support phone" htmlFor="store-phone" hint="Nepali mobile or E.164.">
          <Input
            id="store-phone"
            value={form.contactPhone ?? ''}
            onChange={(event) =>
              setForm((state) => ({ ...state, contactPhone: event.target.value }))
            }
            className="numeric"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Logo URL" htmlFor="store-logo" hint="Leave blank to use the wordmark.">
          <Input
            id="store-logo"
            value={form.logoUrl ?? ''}
            onChange={(event) => setForm((state) => ({ ...state, logoUrl: event.target.value }))}
            placeholder="https://…"
          />
        </Field>

        <Field label="Favicon URL" htmlFor="store-favicon">
          <Input
            id="store-favicon"
            value={form.faviconUrl ?? ''}
            onChange={(event) =>
              setForm((state) => ({ ...state, faviconUrl: event.target.value }))
            }
            placeholder="https://…"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(['facebook', 'instagram', 'tiktok', 'youtube'] as const).map((network) => (
          <Field
            key={network}
            label={network.charAt(0).toUpperCase() + network.slice(1)}
            htmlFor={`social-${network}`}
          >
            <Input
              id={`social-${network}`}
              value={social[network] ?? ''}
              onChange={(event) =>
                setSocial((state) => ({ ...state, [network]: event.target.value }))
              }
              placeholder="https://…"
            />
          </Field>
        ))}
      </div>
    </Panel>
  );
}

/* --- Tax and currency ----------------------------------------------------- */

function TaxSection({ settings, canWrite, save }: SectionProps) {
  const [tax, setTax] = React.useState(settings.tax);
  const [currency, setCurrency] = React.useState(settings.currency);

  // The stored rate is a fraction; operators think in percent. Converting at
  // the edge means the input reads "13" and the database keeps 0.13.
  const [ratePercent, setRatePercent] = React.useState(String((settings.tax.rate * 100).toFixed(2)));

  const commit = () => {
    const parsed = Number(ratePercent);
    const rate = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) / 100 : tax.rate;

    save.mutate({ tax: { ...tax, rate }, currency });
  };

  return (
    <Panel
      title="Tax and currency"
      description="Applied at checkout to every order. Changing these does not alter orders already placed."
      canWrite={canWrite}
      saving={save.isPending}
      onSave={commit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tax rate (%)" htmlFor="tax-rate" hint="Nepal VAT is 13%.">
          <Input
            id="tax-rate"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            value={ratePercent}
            onChange={(event) => setRatePercent(event.target.value)}
          />
        </Field>

        <Field label="Tax label" htmlFor="tax-label" hint="Shown on invoices and the cart.">
          <Input
            id="tax-label"
            value={tax.label}
            onChange={(event) => setTax((state) => ({ ...state, label: event.target.value }))}
            maxLength={20}
          />
        </Field>

        <Field label="VAT / PAN number" htmlFor="tax-registration">
          <Input
            id="tax-registration"
            value={tax.registrationNumber ?? ''}
            onChange={(event) =>
              setTax((state) => ({ ...state, registrationNumber: event.target.value }))
            }
            className="numeric"
            maxLength={40}
          />
        </Field>

        <Field label="Default currency" htmlFor="currency-default">
          <Select
            value={currency.default}
            onValueChange={(value) =>
              setCurrency((state) => ({ ...state, default: value as typeof state.default }))
            }
          >
            <SelectTrigger id="currency-default">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NPR">NPR — Nepali rupee</SelectItem>
              <SelectItem value="USD">USD — US dollar</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="NPR per USD"
          htmlFor="currency-rate"
          hint="Display only — orders are captured in one currency."
        >
          <Input
            id="currency-rate"
            type="number"
            inputMode="decimal"
            min={1}
            step={0.01}
            value={currency.usdToNpr}
            onChange={(event) =>
              setCurrency((state) => ({ ...state, usdToNpr: Number(event.target.value) || 1 }))
            }
          />
        </Field>
      </div>

      <label className="flex items-center justify-between rounded-md border border-border p-3">
        <span>
          <span className="block text-sm font-medium">Prices include tax</span>
          <span className="block text-xs text-muted-foreground">
            On: displayed prices already contain {tax.label}. Off: it is added at checkout.
          </span>
        </span>
        <Switch
          checked={tax.inclusive}
          onCheckedChange={(checked) => setTax((state) => ({ ...state, inclusive: checked }))}
        />
      </label>
    </Panel>
  );
}

/* --- Payments ------------------------------------------------------------- */

const METHOD_LABELS: Record<string, string> = {
  ESEWA: 'eSewa',
  KHALTI: 'Khalti',
  CONNECTIPS: 'ConnectIPS',
  FONEPAY: 'Fonepay',
  IME_PAY: 'IME Pay',
  STRIPE: 'Stripe (cards)',
  PAYPAL: 'PayPal',
  BANK_TRANSFER: 'Bank transfer',
  COD: 'Cash on delivery',
};

function PaymentsSection({ settings, canWrite, save }: SectionProps) {
  const [payments, setPayments] = React.useState(settings.payments);

  const toggle = (method: string, enabled: boolean) => {
    setPayments((state) => ({
      ...state,
      enabled: enabled
        ? [...state.enabled, method]
        : state.enabled.filter((entry) => entry !== method),
    }));
  };

  return (
    <Panel
      title="Payment gateways"
      description="Which methods appear at checkout. Credentials live in environment variables, never here."
      canWrite={canWrite}
      saving={save.isPending}
      onSave={() => save.mutate({ payments })}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {PAYMENT_METHODS.map((method) => {
          const enabled = payments.enabled.includes(method);

          return (
            <label
              key={method}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                enabled ? 'border-primary/50 bg-accent/40' : 'border-border hover:bg-muted',
              )}
            >
              <Checkbox checked={enabled} onCheckedChange={(checked) => toggle(method, !!checked)} />
              <span className="text-sm font-medium">{METHOD_LABELS[method] ?? method}</span>
            </label>
          );
        })}
      </div>

      {payments.enabled.length === 0 ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          With nothing enabled, nobody can check out.
        </p>
      ) : null}

      <Field
        label="Cash-on-delivery ceiling (Rs)"
        htmlFor="cod-max"
        hint="COD is unsecured credit. Blank removes the cap."
      >
        <Input
          id="cod-max"
          type="number"
          inputMode="decimal"
          min={0}
          value={payments.codMaxOrderValue ?? ''}
          onChange={(event) =>
            setPayments((state) => ({
              ...state,
              codMaxOrderValue: event.target.value === '' ? null : Number(event.target.value),
            }))
          }
        />
      </Field>

      <label className="flex items-center justify-between rounded-md border border-border p-3">
        <span>
          <span className="block text-sm font-medium">Test mode</span>
          <span className="block text-xs text-muted-foreground">
            Gateways use their sandbox endpoints. No real money moves.
          </span>
        </span>
        <Switch
          checked={payments.testMode}
          onCheckedChange={(checked) => setPayments((state) => ({ ...state, testMode: checked }))}
        />
      </label>
    </Panel>
  );
}

/* --- Shipping ------------------------------------------------------------- */

function ShippingSection({ settings, canWrite, save }: SectionProps) {
  const [shipping, setShipping] = React.useState(settings.shipping);

  const updateZone = (index: number, patch: Partial<ShippingZoneConfig>) => {
    setShipping((state) => ({
      ...state,
      zones: state.zones.map((zone, position) =>
        position === index ? { ...zone, ...patch } : zone,
      ),
    }));
  };

  const addZone = () => {
    setShipping((state) => ({
      ...state,
      zones: [
        ...state.zones,
        {
          id: `zone-${Date.now().toString(36)}`,
          name: 'New zone',
          districts: [],
          flatRate: state.defaultFlatRate,
          freeShippingThreshold: null,
          estimatedDaysMin: 2,
          estimatedDaysMax: 5,
          isActive: true,
        },
      ],
    }));
  };

  return (
    <Panel
      title="Shipping"
      description="Rates and delivery estimates. A zone with no districts is the fallback for everywhere else."
      canWrite={canWrite}
      saving={save.isPending}
      onSave={() => save.mutate({ shipping })}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Default flat rate (Rs)" htmlFor="ship-flat">
          <Input
            id="ship-flat"
            type="number"
            min={0}
            value={shipping.defaultFlatRate}
            onChange={(event) =>
              setShipping((state) => ({ ...state, defaultFlatRate: Number(event.target.value) || 0 }))
            }
          />
        </Field>

        <Field label="Free over (Rs)" htmlFor="ship-free">
          <Input
            id="ship-free"
            type="number"
            min={0}
            value={shipping.freeShippingThreshold}
            onChange={(event) =>
              setShipping((state) => ({
                ...state,
                freeShippingThreshold: Number(event.target.value) || 0,
              }))
            }
          />
        </Field>

        <Field label="Default carrier" htmlFor="ship-carrier">
          <Select
            value={shipping.defaultCarrier ?? 'NONE'}
            onValueChange={(value) =>
              setShipping((state) => ({
                ...state,
                defaultCarrier: value === 'NONE' ? null : (value as typeof state.defaultCarrier),
              }))
            }
          >
            <SelectTrigger id="ship-carrier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No default</SelectItem>
              {CARRIERS.map((carrier) => (
                <SelectItem key={carrier.id} value={carrier.id}>
                  {carrier.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Zones</h3>
          <Button type="button" variant="outline" size="sm" onClick={addZone} className="gap-1.5">
            <Plus className="size-3.5" aria-hidden />
            Add zone
          </Button>
        </div>

        {shipping.zones.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No zones. The default flat rate applies everywhere.
          </p>
        ) : (
          shipping.zones.map((zone, index) => (
            <div key={zone.id} className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Input
                  value={zone.name}
                  onChange={(event) => updateZone(index, { name: event.target.value })}
                  aria-label={`Name of zone ${index + 1}`}
                  className="max-w-xs font-medium"
                />

                <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  Active
                  <Switch
                    checked={zone.isActive}
                    onCheckedChange={(checked) => updateZone(index, { isActive: checked })}
                  />
                </label>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${zone.name}`}
                  className="text-destructive hover:text-destructive"
                  onClick={() =>
                    setShipping((state) => ({
                      ...state,
                      zones: state.zones.filter((_, position) => position !== index),
                    }))
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Rate (Rs)" htmlFor={`zone-rate-${zone.id}`}>
                  <Input
                    id={`zone-rate-${zone.id}`}
                    type="number"
                    min={0}
                    value={zone.flatRate}
                    onChange={(event) =>
                      updateZone(index, { flatRate: Number(event.target.value) || 0 })
                    }
                  />
                </Field>

                <Field label="Free over (Rs)" htmlFor={`zone-free-${zone.id}`}>
                  <Input
                    id={`zone-free-${zone.id}`}
                    type="number"
                    min={0}
                    value={zone.freeShippingThreshold ?? ''}
                    onChange={(event) =>
                      updateZone(index, {
                        freeShippingThreshold:
                          event.target.value === '' ? null : Number(event.target.value),
                      })
                    }
                  />
                </Field>

                <Field label="Min days" htmlFor={`zone-min-${zone.id}`}>
                  <Input
                    id={`zone-min-${zone.id}`}
                    type="number"
                    min={0}
                    value={zone.estimatedDaysMin}
                    onChange={(event) =>
                      updateZone(index, { estimatedDaysMin: Number(event.target.value) || 0 })
                    }
                  />
                </Field>

                <Field label="Max days" htmlFor={`zone-max-${zone.id}`}>
                  <Input
                    id={`zone-max-${zone.id}`}
                    type="number"
                    min={0}
                    value={zone.estimatedDaysMax}
                    onChange={(event) =>
                      updateZone(index, { estimatedDaysMax: Number(event.target.value) || 0 })
                    }
                  />
                </Field>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Districts ({zone.districts.length || 'everywhere else'})
                </summary>

                <div className="mt-2 grid max-h-44 grid-cols-2 gap-1 overflow-y-auto rounded border border-border p-2 sm:grid-cols-3">
                  {NEPAL_DISTRICTS.map((district) => (
                    <label
                      key={district.name}
                      className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-muted"
                    >
                      <Checkbox
                        checked={zone.districts.includes(district.name)}
                        onCheckedChange={(checked) =>
                          updateZone(index, {
                            districts: checked
                              ? [...zone.districts, district.name]
                              : zone.districts.filter((name) => name !== district.name),
                          })
                        }
                      />
                      {district.name}
                    </label>
                  ))}
                </div>
              </details>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

/* --- Templates ------------------------------------------------------------ */

function TemplatesSection({ settings, canWrite, save }: SectionProps) {
  const [templates, setTemplates] = React.useState<MessageTemplate[]>(
    settings.notifications.templates,
  );
  // Typed as the union rather than inferred from the first element, which
  // would narrow the state to that one literal and reject every other tab.
  const [active, setActive] = React.useState<NotificationTemplateKey>(
    NOTIFICATION_TEMPLATE_KEYS[0],
  );

  const template = templates.find((entry) => entry.key === active);

  const update = (patch: Partial<MessageTemplate>) => {
    setTemplates((state) =>
      state.map((entry) => (entry.key === active ? { ...entry, ...patch } : entry)),
    );
  };

  return (
    <Panel
      title="Email and SMS templates"
      description="What customers are sent when an order moves. Placeholders are filled in at send time."
      canWrite={canWrite}
      saving={save.isPending}
      onSave={() => save.mutate({ notifications: { templates } })}
    >
      <div className="flex flex-wrap gap-1">
        {NOTIFICATION_TEMPLATE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            aria-pressed={active === key}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              active === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {key}
          </button>
        ))}
      </div>

      {!template ? (
        <p className="text-sm text-muted-foreground">This template has not been configured yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground">Available placeholders:</span>
            {TEMPLATE_VARIABLES[active].map((variable) => (
              <code
                key={variable}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {`{{${variable}}}`}
              </code>
            ))}
          </div>

          <Field label="Email subject" htmlFor="template-subject">
            <Input
              id="template-subject"
              value={template.emailSubject}
              onChange={(event) => update({ emailSubject: event.target.value })}
              maxLength={200}
            />
          </Field>

          <Field label="Email body" htmlFor="template-body">
            <Textarea
              id="template-body"
              value={template.emailBody}
              onChange={(event) => update({ emailBody: event.target.value })}
              rows={8}
              maxLength={8000}
            />
          </Field>

          <Field
            label="SMS body"
            htmlFor="template-sms"
            hint={`${template.smsBody?.length ?? 0}/320 — SMS is billed per 160 characters in Nepal.`}
          >
            <Textarea
              id="template-sms"
              value={template.smsBody ?? ''}
              onChange={(event) => update({ smsBody: event.target.value })}
              rows={3}
              maxLength={320}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm font-medium">Send email</span>
              <Switch
                checked={template.emailEnabled}
                onCheckedChange={(checked) => update({ emailEnabled: checked })}
              />
            </label>

            <label className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm font-medium">Send SMS</span>
              <Switch
                checked={template.smsEnabled}
                onCheckedChange={(checked) => update({ smsEnabled: checked })}
                disabled={!template.smsBody}
              />
            </label>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* --- Maintenance ---------------------------------------------------------- */

function MaintenanceSection({ settings, canWrite, save }: SectionProps) {
  const [maintenance, setMaintenance] = React.useState(settings.maintenance);

  return (
    <Panel
      title="Maintenance mode"
      description="Closes the storefront to shoppers. The admin panel stays reachable."
      canWrite={canWrite}
      saving={save.isPending}
      onSave={() => save.mutate({ maintenance })}
    >
      <label className="flex items-center justify-between rounded-md border border-border p-3">
        <span>
          <span className="block text-sm font-medium">Maintenance mode</span>
          <span className="block text-xs text-muted-foreground">
            Shoppers see the message below instead of the store.
          </span>
        </span>
        <Switch
          checked={maintenance.enabled}
          onCheckedChange={(checked) =>
            setMaintenance((state) => ({ ...state, enabled: checked }))
          }
        />
      </label>

      <Field label="Message" htmlFor="maintenance-message">
        <Textarea
          id="maintenance-message"
          value={maintenance.message}
          onChange={(event) =>
            setMaintenance((state) => ({ ...state, message: event.target.value }))
          }
          rows={3}
          maxLength={500}
        />
      </Field>

      {maintenance.enabled ? (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-caution">
          Saving this closes the store to every shopper immediately.
        </p>
      ) : null}
    </Panel>
  );
}
