import { Prisma } from '@prisma/client';

import { buildDiff, REDACTED_FIELDS } from './activity-log.service';

/**
 * The diff is the part of the audit trail that has to be right.
 *
 * A log that says "the product was updated" is worth nothing a year later; one
 * that says "price 2499 -> 1999" answers the question that was actually asked.
 * These tests pin the two ways that goes wrong: reporting changes that did not
 * happen, and leaking things that should never have been written down.
 */
describe('buildDiff', () => {
  it('reports only the fields that moved', () => {
    const diff = buildDiff(
      { name: 'Lamp', price: 2499, brand: 'Hearth' },
      { name: 'Lamp', price: 1999, brand: 'Hearth' },
    );

    expect(diff).toEqual([{ field: 'price', before: 2499, after: 1999 }]);
  });

  it('reports every field on a create, where there is no "before"', () => {
    const diff = buildDiff(null, { code: 'DASHAIN500', value: 500 });

    expect(diff).toHaveLength(2);
    expect(diff).toContainEqual({ field: 'code', before: null, after: 'DASHAIN500' });
  });

  it('does not treat a Decimal re-read from Postgres as a change', () => {
    // Prisma hands numeric columns back as Decimal objects. Comparing those by
    // reference - or by JSON, which serialises them as strings - makes every
    // save look like it changed every money field.
    const diff = buildDiff(
      { price: new Prisma.Decimal('2499.00') },
      { price: new Prisma.Decimal(2499) },
    );

    expect(diff).toEqual([]);
  });

  it('does not treat an equal Date as a change, whatever object it arrived in', () => {
    const when = '2026-09-02T13:00:00.000Z';

    expect(buildDiff({ validFrom: new Date(when) }, { validFrom: new Date(when) })).toEqual([]);
  });

  it('ignores key order inside a nested object', () => {
    const diff = buildDiff(
      { attributes: { colour: 'Red', size: 'XL' } },
      { attributes: { size: 'XL', colour: 'Red' } },
    );

    expect(diff).toEqual([]);
  });

  it('detects a genuine change inside a nested object', () => {
    const diff = buildDiff(
      { attributes: { colour: 'Red' } },
      { attributes: { colour: 'Blue' } },
    );

    expect(diff).toHaveLength(1);
    expect(diff[0]?.field).toBe('attributes');
  });

  it('detects an array whose contents changed but not one that was only re-read', () => {
    expect(buildDiff({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([]);
    expect(buildDiff({ tags: ['a'] }, { tags: ['a', 'b'] })).toHaveLength(1);
  });

  it('never writes a secret into the log, on either side', () => {
    const diff = buildDiff(
      { passwordHash: 'old-hash', email: 'a@example.com' },
      { passwordHash: 'new-hash', email: 'b@example.com' },
    );

    expect(diff.map((entry) => entry.field)).toEqual(['email']);
  });

  it('redacts secrets nested inside a value it does report', () => {
    const diff = buildDiff(null, { config: { apiKey: 'sk-live-123', enabled: true } });
    const after = diff[0]?.after as Record<string, unknown>;

    expect(after.apiKey).toBe('[redacted]');
    expect(after.enabled).toBe(true);
  });

  it('truncates a long value rather than storing a whole product description', () => {
    const diff = buildDiff(null, { description: 'x'.repeat(2000) });
    const after = diff[0]?.after as string;

    expect(after.length).toBeLessThan(600);
    expect(after.endsWith('...')).toBe(true);
  });

  it('returns nothing when there is nothing to compare', () => {
    expect(buildDiff(null, null)).toEqual([]);
  });

  it('keeps the redaction list covering the fields that actually exist', () => {
    // A guard against someone adding a secret column and forgetting this list.
    expect(REDACTED_FIELDS.has('passwordHash')).toBe(true);
    expect(REDACTED_FIELDS.has('tokenHash')).toBe(true);
    expect(REDACTED_FIELDS.has('twoFactorSecret')).toBe(true);
  });
});
