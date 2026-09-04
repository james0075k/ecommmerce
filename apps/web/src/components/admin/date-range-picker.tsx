'use client';

import * as React from 'react';
import { CalendarRange } from 'lucide-react';
import { ANALYTICS_PRESETS } from '@bazaar/shared';
import type { AnalyticsPreset } from '@bazaar/shared';

import { Input } from '@/components/ui/input';
import type { RangeParams } from '@/lib/admin';
import { cn } from '@/lib/utils';

const PRESET_LABELS: Record<AnalyticsPreset, string> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '12m': '12 months',
  custom: 'Custom',
};

/**
 * The analytics date range.
 *
 * Presets first, because they are what gets used - "last 30 days" is one click
 * and two dates typed correctly is not. The custom fields only appear once
 * custom is chosen, so the common path stays a single row of chips.
 *
 * The change is not published until a custom range is *complete*. Emitting on
 * every keystroke would fire a query for each half-typed date, and the server
 * rejects a custom range missing either end anyway - so the picker holds the
 * draft rather than sending something it knows is invalid.
 */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: RangeParams;
  onChange: (next: RangeParams) => void;
  className?: string;
}) {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [draftFrom, setDraftFrom] = React.useState(value.from ?? '');
  const [draftTo, setDraftTo] = React.useState(value.to ?? today);

  const selectPreset = (preset: AnalyticsPreset) => {
    if (preset !== 'custom') {
      onChange({ preset });
      return;
    }

    // Seed the custom fields with a sensible fortnight rather than two blanks.
    const from = draftFrom || isoDaysAgo(13);
    const to = draftTo || today;

    setDraftFrom(from);
    setDraftTo(to);
    onChange({ preset: 'custom', from, to });
  };

  const commitCustom = (from: string, to: string) => {
    setDraftFrom(from);
    setDraftTo(to);
    if (from && to && from <= to) onChange({ preset: 'custom', from, to });
  };

  const invalid = value.preset === 'custom' && draftFrom && draftTo && draftFrom > draftTo;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        role="group"
        aria-label="Date range"
        className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1"
      >
        <CalendarRange className="mx-1.5 size-4 shrink-0 text-muted-foreground" aria-hidden />

        {ANALYTICS_PRESETS.map((preset) => {
          const active = value.preset === preset;

          return (
            <button
              key={preset}
              type="button"
              onClick={() => selectPreset(preset)}
              aria-pressed={active}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {PRESET_LABELS[preset]}
            </button>
          );
        })}
      </div>

      {value.preset === 'custom' ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            From
            <Input
              type="date"
              value={draftFrom}
              max={draftTo || today}
              onChange={(event) => commitCustom(event.target.value, draftTo)}
              className="h-8 w-auto text-xs"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            To
            <Input
              type="date"
              value={draftTo}
              min={draftFrom}
              max={today}
              onChange={(event) => commitCustom(draftFrom, event.target.value)}
              className="h-8 w-auto text-xs"
            />
          </label>

          {invalid ? (
            <p className="text-xs text-destructive">The start must be on or before the end.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
