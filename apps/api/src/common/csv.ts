/**
 * CSV rendering shared by every export in the admin panel.
 */

/**
 * RFC 4180 quoting.
 *
 * The leading-character guard is the one that matters: Excel treats a cell
 * starting with `=`, `+`, `-` or `@` as a formula, so a customer who names
 * themselves `=cmd|...` gets their name executed on an operator's machine when
 * the export is opened. Prefixing a quote neutralises it and still reads as the
 * original text.
 */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** A header row plus body rows, quoted and joined with CRLF as the RFC wants. */
export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/**
 * The byte-order mark Excel needs to read a CSV as UTF-8 rather than the local
 * codepage - without it a Nepali customer name arrives as mojibake. Written as
 * an escape rather than a literal so it cannot be lost by an editor that trims
 * invisible characters.
 */
export const CSV_BOM = '﻿';
