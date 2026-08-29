'use client';

import * as React from 'react';
import { Check, Minus, X } from 'lucide-react';

import { cn } from '@/lib/utils';

type CheckState = 'pass' | 'fail' | 'pending';

interface ManifestRow {
  label: string;
  detail: string;
  state: CheckState;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

interface HealthPayload {
  status: string;
  environment: string;
  services: { api: string; database: string };
}

/**
 * The Phase 1 acceptance check, rendered as a live manifest.
 *
 * Static rows prove the frontend wiring (fonts, tokens, theming). The API and
 * database rows are probed at runtime, so this page answers "did Phase 1 land?"
 * without a terminal. Replaced by the real homepage in Phase 9.
 */
export function BuildManifest() {
  const [health, setHealth] = React.useState<HealthPayload | null>(null);
  const [apiState, setApiState] = React.useState<CheckState>('pending');
  const [fontsReady, setFontsReady] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}/health`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<HealthPayload>) : null))
      .then((payload) => {
        if (!payload) {
          setApiState('fail');
          return;
        }
        setHealth(payload);
        setApiState('pass');
      })
      .catch(() => setApiState('fail'));

    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    void document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  const rows: ManifestRow[] = [
    {
      label: 'design tokens',
      detail: 'Part H1 · 5 brand colours, 4 radii, 2 shadows',
      state: 'pass',
    },
    {
      label: 'typefaces',
      detail: 'Plus Jakarta Sans · Inter · JetBrains Mono',
      state: fontsReady ? 'pass' : 'pending',
    },
    {
      label: 'theming',
      detail: 'next-themes · dark default, light toggle',
      state: 'pass',
    },
    {
      label: 'component library',
      detail: 'shadcn/ui · 16 primitives on Radix',
      state: 'pass',
    },
    {
      label: 'api',
      detail:
        apiState === 'pass'
          ? `${API_URL} · ${health?.environment ?? 'unknown'}`
          : apiState === 'fail'
            ? `${API_URL} · unreachable, run pnpm dev`
            : 'probing…',
      state: apiState,
    },
    {
      label: 'database',
      detail:
        health?.services.database === 'up'
          ? 'postgresql · connected'
          : apiState === 'pass'
            ? 'postgresql · not connected, see README'
            : 'waiting on api',
      state:
        health?.services.database === 'up' ? 'pass' : apiState === 'pass' ? 'fail' : 'pending',
    },
  ];

  const passed = rows.filter((row) => row.state === 'pass').length;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3">
        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          phase 1 · foundation
        </span>
        <span className="numeric text-xs text-muted-foreground">
          {passed}/{rows.length} checks passing
        </span>
      </div>

      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-3 px-4 py-2.5 font-mono text-xs sm:gap-4"
          >
            <StateIcon state={row.state} />
            <dt className="w-32 shrink-0 text-foreground sm:w-40">{row.label}</dt>
            <dd className="truncate text-muted-foreground">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StateIcon({ state }: { state: CheckState }) {
  const Icon = state === 'pass' ? Check : state === 'fail' ? X : Minus;

  return (
    <span
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-full',
        state === 'pass' && 'bg-success/15 text-success',
        state === 'fail' && 'bg-destructive/15 text-destructive',
        state === 'pending' && 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="size-2.5" strokeWidth={3} aria-hidden />
      <span className="sr-only">{state}</span>
    </span>
  );
}
