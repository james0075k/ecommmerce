/**
 * Display formatters shared by the storefront and the admin panel.
 * Presentation only - money is always calculated server-side (D2).
 */

/**
 * Formats an amount for display, e.g. `Rs 2,499` / `$24.99`.
 * `narrowSymbol` is what makes NPR render as "Rs" rather than "NPR".
 * Rupees are shown without decimals - sub-rupee prices are not a real case.
 */
export function formatPrice(amount: number, currency: 'NPR' | 'USD' = 'NPR'): string {
  return new Intl.NumberFormat(currency === 'NPR' ? 'en-NP' : 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: currency === 'NPR' ? 0 : 2,
  }).format(amount);
}

export function formatDate(value: Date | string, locale = 'en-NP'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(value);
}

/** Turns "Premium Cotton T-Shirt" into "premium-cotton-t-shirt". */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
