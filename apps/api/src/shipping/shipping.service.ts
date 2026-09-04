import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SHIPPING_METHOD,
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_METHODS,
  shippingZoneFor,
} from '@bazaar/shared';
import type { ShippingMethodId, ShippingQuote } from '@bazaar/shared';

/**
 * District-aware shipping rates (F1.6).
 *
 * The cart drawer shows a flat estimate because it has no address yet; this is
 * where the real number comes from, once checkout knows the delivery district.
 * Both read the same `FREE_SHIPPING_THRESHOLD`, so a cart promising free
 * shipping never surprises the shopper with a charge at step 2.
 */
@Injectable()
export class ShippingService {
  /** Every method priced for one district and cart value, for the step-2 list. */
  quoteAll(district: string, subtotal: number): ShippingQuote[] {
    return SHIPPING_METHODS.map((method) => this.quote(method.id, district, subtotal));
  }

  quote(methodId: ShippingMethodId, district: string, subtotal: number): ShippingQuote {
    // SHIPPING_METHODS is a non-empty literal tuple, but TypeScript types
    // `find` and index access as possibly-undefined, so the fallback is spelled
    // out rather than asserted away.
    const method = SHIPPING_METHODS.find((candidate) => candidate.id === methodId);

    if (!method) {
      return this.quote(DEFAULT_SHIPPING_METHOD, district, subtotal);
    }

    const zone = shippingZoneFor(district);
    const baseCost = method.rates[zone];

    // Only Standard is ever waived - Express is a real courier cost that a
    // large basket does not make disappear.
    const isFree = method.freeOverThreshold && subtotal >= FREE_SHIPPING_THRESHOLD;

    const [minDays, maxDays] = method.etaDays[zone];

    return {
      method: method.id,
      label: method.label,
      description: method.description,
      zone,
      cost: isFree ? 0 : baseCost,
      baseCost,
      isFree,
      estimatedDaysMin: minDays,
      estimatedDaysMax: maxDays,
      estimatedDeliveryDate: addBusinessDays(new Date(), maxDays).toISOString(),
    };
  }

  /** The cost alone, for the checkout total. */
  costFor(methodId: ShippingMethodId, district: string, subtotal: number): number {
    return this.quote(methodId, district, subtotal).cost;
  }

  isValidMethod(value: string): value is ShippingMethodId {
    return SHIPPING_METHODS.some((method) => method.id === value);
  }

  get defaultMethod(): ShippingMethodId {
    return DEFAULT_SHIPPING_METHOD;
  }
}

/**
 * Couriers do not run on Saturdays, which is Nepal's weekly holiday. Friday is
 * a normal working day here, so only Saturday is skipped - using a
 * Saturday+Sunday weekend would push every estimate a day late.
 */
function addBusinessDays(from: Date, days: number): Date {
  const date = new Date(from);
  let remaining = days;

  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 6) remaining -= 1;
  }

  return date;
}
