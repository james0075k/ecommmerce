import { CouponType, FREE_SHIPPING_THRESHOLD, SHIPPING_FLAT_RATE } from '@bazaar/shared';
import type { AppliedCoupon, CartLine } from '@bazaar/shared';

import { summarise } from './cart.service';

/**
 * `summarise` is the single place cart money is computed, and the drawer, the
 * badge and the checkout estimate all read its output. These pin the rules that
 * are easy to get subtly wrong: what free shipping applies to, and how a
 * FREE_SHIPPING coupon differs from a discount.
 */

function line(overrides: Partial<CartLine> = {}): CartLine {
  const quantity = overrides.quantity ?? 1;
  const unitPrice = overrides.unitPrice ?? 500;

  return {
    id: 'line-1',
    quantity,
    addedAt: new Date().toISOString(),
    product: {
      id: 'p1',
      name: 'Test product',
      slug: 'test-product',
      brand: null,
      currency: 'NPR',
      image: null,
    },
    variant: { id: 'v1', sku: 'SKU-1', name: 'Default', attributes: {} },
    unitPrice,
    lineTotal: unitPrice * quantity,
    compareAtPrice: null,
    availableQuantity: 10,
    isOutOfStock: false,
    isPartiallyAvailable: false,
    maxQuantity: 10,
    ...overrides,
  };
}

function coupon(overrides: Partial<AppliedCoupon> = {}): AppliedCoupon {
  return {
    code: 'SAVE20',
    type: CouponType.PERCENTAGE,
    value: 20,
    discountAmount: 200,
    isPartial: false,
    description: '20% off',
    ...overrides,
  };
}

describe('summarise', () => {
  it('reports an empty cart with no shipping charge', () => {
    const summary = summarise([], null);

    expect(summary.subtotal).toBe(0);
    expect(summary.total).toBe(0);
    expect(summary.itemCount).toBe(0);
    // An empty cart must not show a shipping fee - there is nothing to ship.
    expect(summary.shipping).toBe(0);
    expect(summary.isFreeShipping).toBe(false);
  });

  it('counts units, not lines, for the navbar badge', () => {
    const summary = summarise(
      [line({ id: 'a', quantity: 3 }), line({ id: 'b', quantity: 2 })],
      null,
    );

    expect(summary.itemCount).toBe(5);
  });

  it('charges flat-rate shipping below the free threshold', () => {
    const summary = summarise([line({ unitPrice: 1000 })], null);

    expect(summary.subtotal).toBe(1000);
    expect(summary.shipping).toBe(SHIPPING_FLAT_RATE);
    expect(summary.total).toBe(1000 + SHIPPING_FLAT_RATE);
    expect(summary.freeShippingRemaining).toBe(FREE_SHIPPING_THRESHOLD - 1000);
  });

  it('gives free shipping at exactly the threshold, not just above it', () => {
    const summary = summarise([line({ unitPrice: FREE_SHIPPING_THRESHOLD })], null);

    expect(summary.shipping).toBe(0);
    expect(summary.isFreeShipping).toBe(true);
    expect(summary.freeShippingRemaining).toBe(0);
  });

  it('subtracts a percentage discount from the total', () => {
    const summary = summarise([line({ unitPrice: 1000 })], coupon());

    expect(summary.discount).toBe(200);
    expect(summary.total).toBe(1000 - 200 + SHIPPING_FLAT_RATE);
  });

  it('applies a FREE_SHIPPING coupon to the shipping line, not as a discount', () => {
    // Counting it in both places would take the shipping cost off twice.
    const summary = summarise(
      [line({ unitPrice: 1000 })],
      coupon({ type: CouponType.FREE_SHIPPING, discountAmount: SHIPPING_FLAT_RATE }),
    );

    expect(summary.shipping).toBe(0);
    expect(summary.discount).toBe(0);
    expect(summary.total).toBe(1000);
  });

  it('never lets a discount drive the total negative', () => {
    const summary = summarise(
      [line({ unitPrice: 100 })],
      coupon({ type: CouponType.FIXED, discountAmount: 100_000 }),
    );

    expect(summary.total).toBe(0);
  });

  it('keeps out-of-stock lines in the subtotal so it does not jump on removal', () => {
    const summary = summarise(
      [line({ id: 'a', unitPrice: 300 }), line({ id: 'b', unitPrice: 200, isOutOfStock: true })],
      null,
    );

    expect(summary.subtotal).toBe(500);
  });

  it('rounds money to two decimals', () => {
    const summary = summarise(
      [line({ unitPrice: 33.333, quantity: 3, lineTotal: 99.999 })],
      null,
    );

    expect(summary.subtotal).toBe(100);
  });

  it('takes the currency from the cart contents', () => {
    const summary = summarise([line({ product: { ...line().product, currency: 'USD' } })], null);
    expect(summary.currency).toBe('USD');
  });
});
