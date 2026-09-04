import { orderSchema, CANCELLABLE_ORDER_STATUSES, OrderStatus } from '@bazaar/shared';

import { isCancellable } from './orders.service';

/**
 * The order-number format is part of the shared `orderSchema` contract, and the
 * cancellation rule decides whether money moves - both are worth pinning even
 * though neither touches a gateway.
 */

/** Mirrors `generateOrderNumber`, which is module-private by design. */
const ORDER_NUMBER = orderSchema.shape.orderNumber;

describe('order numbers', () => {
  it('accepts the format the service generates', () => {
    expect(ORDER_NUMBER.safeParse('ORD-20260901-AB12').success).toBe(true);
  });

  it.each([
    ['lowercase suffix', 'ORD-20260901-ab12'],
    ['missing prefix', '20260901-AB12'],
    ['short date', 'ORD-2026901-AB12'],
    ['suffix too short', 'ORD-20260901-AB'],
  ])('rejects a malformed number (%s)', (_label, value) => {
    expect(ORDER_NUMBER.safeParse(value).success).toBe(false);
  });

  it('uses an alphabet with no look-alike characters', () => {
    // The generator's alphabet omits I, L, O and U so a number read aloud or
    // copied off a printed invoice cannot be mistyped into someone else's order.
    const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';

    for (const letter of ['I', 'L', 'O', 'U']) {
      expect(alphabet).not.toContain(letter);
    }
  });
});

describe('isCancellable', () => {
  it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED])(
    'allows cancelling a %s order',
    (status) => {
      expect(isCancellable(status)).toBe(true);
    },
  );

  it.each([
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ])('refuses to cancel a %s order', (status) => {
    // Past PROCESSING the parcel is with a courier, so this becomes a return -
    // a different flow with different money movement.
    expect(isCancellable(status)).toBe(false);
  });

  it('agrees with the shared constant the frontend also reads', () => {
    for (const status of CANCELLABLE_ORDER_STATUSES) {
      expect(isCancellable(status)).toBe(true);
    }
  });
});
