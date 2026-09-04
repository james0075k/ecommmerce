'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Building2,
  CreditCard,
  ExternalLink,
  Landmark,
  QrCode,
  Smartphone,
  Wallet,
} from 'lucide-react';

import { PaymentMethod } from '@bazaar/shared';
import type { PaymentMethodOption } from '@bazaar/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { useCartStore } from '@/lib/store/cart-store';
import { useCheckoutStore } from '@/lib/store/checkout-store';
import { cn } from '@/lib/utils';

const ICONS: Record<string, typeof CreditCard> = {
  [PaymentMethod.ESEWA]: Wallet,
  [PaymentMethod.KHALTI]: Wallet,
  [PaymentMethod.CONNECTIPS]: Landmark,
  [PaymentMethod.FONEPAY]: QrCode,
  [PaymentMethod.IME_PAY]: Smartphone,
  [PaymentMethod.STRIPE]: CreditCard,
  [PaymentMethod.PAYPAL]: CreditCard,
  [PaymentMethod.BANK_TRANSFER]: Building2,
  [PaymentMethod.COD]: Banknote,
};

/** What happens after "Place order", stated before they commit to it. */
const FLOW_NOTES: Partial<Record<PaymentMethod, string>> = {
  [PaymentMethod.ESEWA]: 'You will be taken to eSewa to approve the payment, then brought back here.',
  [PaymentMethod.KHALTI]: 'You will be taken to Khalti to approve the payment, then brought back here.',
  [PaymentMethod.CONNECTIPS]: 'You will be taken to ConnectIPS to authorise the bank debit.',
  [PaymentMethod.IME_PAY]: 'You will be taken to IME Pay to approve the payment.',
  [PaymentMethod.PAYPAL]: 'You will be taken to PayPal to approve the payment.',
  [PaymentMethod.FONEPAY]: 'A QR code appears on the next screen — scan it with your bank app.',
  [PaymentMethod.STRIPE]: 'Enter your card details on the next screen. Nothing is charged until you confirm.',
  [PaymentMethod.COD]: 'Pay the courier in cash when your order arrives. Your order is confirmed straight away.',
  [PaymentMethod.BANK_TRANSFER]: 'We show you our account details. Your order ships once the transfer clears.',
};

/**
 * Step 3 - how they pay.
 *
 * The list comes from the server, including which gateways actually have
 * credentials. An unconfigured gateway is shown greyed out rather than hidden:
 * "eSewa is temporarily unavailable" is information; a silently absent option
 * just looks like the shop does not take eSewa.
 */
export function PaymentStep() {
  const selected = useCheckoutStore((state) => state.paymentMethod);
  const setPaymentMethod = useCheckoutStore((state) => state.setPaymentMethod);
  const notes = useCheckoutStore((state) => state.notes);
  const setNotes = useCheckoutStore((state) => state.setNotes);
  const next = useCheckoutStore((state) => state.next);
  const back = useCheckoutStore((state) => state.back);

  const currency = useCartStore((state) => state.view?.summary.currency ?? 'NPR');

  const { data: methods, isPending } = useQuery({
    queryKey: ['payment-methods', currency],
    queryFn: () => apiFetch<PaymentMethodOption[]>(`/payments/methods?currency=${currency}`),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-medium">How would you like to pay?</h2>

      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Payment method">
          {(methods ?? []).map((option) => {
            const Icon = ICONS[option.method] ?? CreditCard;
            const isSelected = selected === option.method;

            return (
              <li key={option.method}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={!option.isAvailable}
                  onClick={() => setPaymentMethod(option.method)}
                  className={cn(
                    'flex h-full w-full items-start gap-3 rounded-md border p-4 text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40',
                    !option.isAvailable && 'cursor-not-allowed opacity-50 hover:border-border',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{option.label}</span>
                      {!option.isAvailable ? (
                        <Badge variant="secondary">Unavailable</Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground text-pretty">
                      {option.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && FLOW_NOTES[selected] ? (
        <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 p-4 text-sm">
          <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-pretty">{FLOW_NOTES[selected]}</p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="order-notes" className="text-sm font-medium">
          Delivery notes (optional)
        </label>
        <Textarea
          id="order-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value.slice(0, 1000))}
          placeholder="Landmarks, gate colour, best time to call…"
          rows={3}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={next} disabled={!selected}>
          Review order
        </Button>
        <Button variant="ghost" onClick={back}>
          Back
        </Button>
      </div>
    </div>
  );
}
