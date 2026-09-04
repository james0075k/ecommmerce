import { delta, resolveRange } from './analytics.service';

/**
 * The pure pieces of the analytics service: how a preset becomes a window, and
 * how two figures become a percentage change.
 *
 * These are unit-testable because they are deliberately free of Prisma. The
 * query methods are integration territory - they are one `groupBy` each, and a
 * test that mocks the client only asserts that the mock was called.
 */
describe('resolveRange', () => {
  const DAY = 24 * 60 * 60 * 1000;

  /** A fixed "now" so the assertions do not drift with the clock. */
  const to = new Date('2026-09-02T13:00:00Z');

  const spanDays = (from: Date, until: Date): number =>
    Math.round((startOfLocalDay(until).getTime() - from.getTime()) / DAY) + 1;

  function startOfLocalDay(date: Date): Date {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  it('resolves "today" to the start of the current day', () => {
    const range = resolveRange({ preset: 'today', to, granularity: 'day' });

    expect(range.from).toEqual(startOfLocalDay(to));
    expect(range.to).toEqual(to);
  });

  it('makes 7d and 30d inclusive of today', () => {
    // "Last 7 days" means today plus the six before it, not today minus seven -
    // an off-by-one here silently shifts every comparison in the panel.
    expect(spanDays(resolveRange({ preset: '7d', to, granularity: 'day' }).from, to)).toBe(7);
    expect(spanDays(resolveRange({ preset: '30d', to, granularity: 'day' }).from, to)).toBe(30);
    expect(spanDays(resolveRange({ preset: '90d', to, granularity: 'day' }).from, to)).toBe(90);
  });

  it('honours an explicit custom window', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const range = resolveRange({ preset: 'custom', from, to, granularity: 'day' });

    expect(range.from).toEqual(from);
    expect(range.to).toEqual(to);
  });

  it('coarsens the buckets on a long range rather than returning 365 points', () => {
    // A year of daily ticks is unreadable on an 800px axis, so the service
    // widens the bucket itself instead of trusting the caller to.
    expect(resolveRange({ preset: '12m', to, granularity: 'day' }).granularity).toBe('week');
    expect(resolveRange({ preset: '30d', to, granularity: 'day' }).granularity).toBe('day');
  });

  it('leaves a coarser granularity alone when the caller asked for one', () => {
    expect(resolveRange({ preset: '30d', to, granularity: 'month' }).granularity).toBe('month');
  });
});

describe('delta', () => {
  it('reports the percentage change between two periods', () => {
    expect(delta(150, 100)).toEqual({ current: 150, previous: 100, changePct: 50 });
    expect(delta(50, 100)).toEqual({ current: 50, previous: 100, changePct: -50 });
    expect(delta(100, 100).changePct).toBe(0);
  });

  it('reports null rather than infinity when there was nothing to compare against', () => {
    // The panel renders this as "New". "+Infinity%" or "+100%" would both be
    // inventions: a first week of trading has no growth rate.
    expect(delta(500, 0).changePct).toBeNull();
    expect(delta(0, 0).changePct).toBeNull();
  });

  it('reports a total loss as -100%', () => {
    expect(delta(0, 250).changePct).toBe(-100);
  });
});
