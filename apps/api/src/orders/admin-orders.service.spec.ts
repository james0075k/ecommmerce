import {
  canTransition,
  carrierLabel,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
  trackingUrlFor,
} from '@bazaar/shared';

import { csvCell } from './admin-orders.service';
import { endOfDay } from './orders.service';

/**
 * The three pieces of admin order handling that are worth pinning: the rules
 * that decide whether an operator's click is legal, the escaping that decides
 * whether an export is safe to open, and the date bound that decides whether a
 * filter hides orders.
 */

describe('order status transitions', () => {
  it('walks the happy path one step at a time', () => {
    const flow = [...ORDER_STATUS_FLOW];

    flow.slice(0, -1).forEach((status, index) => {
      expect(canTransition(status, flow[index + 1] as OrderStatus)).toBe(true);
    });
  });

  it.each([
    ['skipping straight to delivered', OrderStatus.CONFIRMED, OrderStatus.DELIVERED],
    ['shipping an unpaid order', OrderStatus.PENDING, OrderStatus.SHIPPED],
    ['packing before payment', OrderStatus.PENDING, OrderStatus.PROCESSING],
  ])('refuses %s', (_label, from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('never goes backwards', () => {
    // A timeline that can rewind is not a record of anything, so no earlier
    // status may follow a later one.
    const flow = [...ORDER_STATUS_FLOW];

    flow.forEach((status, index) => {
      for (const earlier of flow.slice(0, index)) {
        expect(canTransition(status, earlier)).toBe(false);
      }
    });
  });

  it('lets an operator cancel anything short of delivery', () => {
    for (const status of [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
    ]) {
      expect(canTransition(status, OrderStatus.CANCELLED)).toBe(true);
    }
  });

  it('treats refunded as final', () => {
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.REFUNDED]).toHaveLength(0);
  });

  it('cannot cancel an order that has already arrived', () => {
    // That is a return, which moves different money and different stock.
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toBe(false);
  });
});

describe('tracking links', () => {
  it('builds the courier URL from the carrier and consignment number', () => {
    expect(trackingUrlFor('NCM', 'ABC123')).toContain('ABC123');
  });

  it('escapes the consignment number into the URL', () => {
    expect(trackingUrlFor('NCM', 'A B/C')).toContain('A%20B%2FC');
  });

  it.each([
    ['no carrier', null, 'ABC123'],
    ['no tracking number', 'NCM', null],
    ['a courier with no tracking page', 'SELF', 'ABC123'],
    ['an unknown carrier', 'PIGEON', 'ABC123'],
  ])('returns null for %s', (_label, carrier, tracking) => {
    expect(trackingUrlFor(carrier, tracking)).toBeNull();
  });

  it('falls back to the raw id when a carrier is not in the list', () => {
    expect(carrierLabel('PIGEON')).toBe('PIGEON');
    expect(carrierLabel('NCM')).toBe('Nepal Can Move');
  });
});

describe('CSV export cells', () => {
  it('quotes every cell', () => {
    expect(csvCell('Kathmandu')).toBe('"Kathmandu"');
  });

  it('doubles embedded quotes', () => {
    expect(csvCell('Ram "Bahadur"')).toBe('"Ram ""Bahadur"""');
  });

  it('keeps a comma inside one cell', () => {
    expect(csvCell('Lalitpur, Bagmati')).toBe('"Lalitpur, Bagmati"');
  });

  it.each(['=cmd|calc', '+1234', '-2+3', '@SUM(A1)'])(
    'neutralises the formula %s a spreadsheet would otherwise execute',
    (value) => {
      // Excel runs a cell beginning with any of these. Prefixing an apostrophe
      // makes it text again without changing what a reader sees.
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );
});

describe('endOfDay', () => {
  it('extends a date filter to cover the whole day chosen', () => {
    const end = endOfDay(new Date('2026-09-08T00:00:00'));

    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    // Without this, "1 Sep to 8 Sep" silently drops everything bought on the
    // 8th, which reads to a shopper as lost orders.
    expect(end.getSeconds()).toBe(59);
  });

  it('does not mutate the date it was given', () => {
    const original = new Date('2026-09-08T09:30:00');
    endOfDay(original);

    expect(original.getHours()).toBe(9);
  });
});
