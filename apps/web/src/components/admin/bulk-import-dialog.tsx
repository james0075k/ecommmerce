'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import type { BulkImportResult, BulkImportRowError } from '@bazaar/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError, apiFetch, API_BASE_URL } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Preview {
  willImport: number;
  failed: BulkImportRowError[];
  sample: Array<{ sku: string; name: string; basePrice: number }>;
}

/**
 * Two-step CSV import: validate and preview, then commit.
 *
 * Nothing is written until the admin has seen how many rows will import and
 * which will fail, so a malformed file cannot half-populate the catalog.
 */
export function BulkImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = React.useState('');
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [result, setResult] = React.useState<BulkImportResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const reset = () => {
    setCsv('');
    setFileName(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const readFile = async (file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      setError('That is not a .csv file.');
      return;
    }

    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setResult(null);
    setError(null);

    setBusy(true);
    try {
      setPreview(
        await apiFetch<Preview>('/admin/products/bulk-import/preview', {
          method: 'POST',
          body: { csv: text },
        }),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not read that file.');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);

    try {
      const outcome = await apiFetch<BulkImportResult>('/admin/products/bulk-import', {
        method: 'POST',
        body: { csv },
      });
      setResult(outcome);
      toast.success(`${outcome.created} created, ${outcome.updated} updated.`);
      onImported();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Import products from CSV</DialogTitle>
          <DialogDescription>
            Rows are matched on SKU — an existing SKU updates rather than duplicates.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {result ? (
          <ImportSummary result={result} />
        ) : (
          <>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void readFile(file);
              }}
              className={cn(
                'rounded-md border-2 border-dashed p-8 text-center transition-colors',
                dragging ? 'border-primary bg-accent/40' : 'border-border',
              )}
            >
              <FileUp className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-medium">
                {fileName ?? 'Drop a CSV here, or choose a file'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Up to 5,000 rows per file.
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void readFile(file);
                    }}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
                    Choose file
                  </span>
                </label>

                <Button variant="ghost" size="sm" asChild>
                  <a href={`${API_BASE_URL}/admin/products/bulk-import/template`}>
                    Download template
                  </a>
                </Button>
              </div>
            </div>

            {busy && !preview ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Checking the file…
              </p>
            ) : null}

            {preview ? <PreviewPanel preview={preview} /> : null}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result ? (
            <Button disabled={busy || !preview || preview.willImport === 0} onClick={runImport}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Import {preview?.willImport ?? 0} products
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewPanel({ preview }: { preview: Preview }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-ok">
          <CheckCircle2 className="size-4" />
          {preview.willImport} ready
        </span>
        {preview.failed.length > 0 ? (
          <span className="flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="size-4" />
            {preview.failed.length} with errors
          </span>
        ) : null}
      </div>

      {preview.sample.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-xs tracking-wider text-muted-foreground uppercase">
                <th className="px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.sample.map((row) => (
                <tr key={row.sku}>
                  <td className="numeric px-3 py-2 text-xs">{row.sku}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="numeric px-3 py-2 text-right">{row.basePrice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview.failed.length > 0 ? <FailureList failures={preview.failed} /> : null}
    </div>
  );
}

function FailureList({ failures }: { failures: BulkImportRowError[] }) {
  return (
    <div className="max-h-48 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <ul className="space-y-1.5 text-sm">
        {failures.slice(0, 30).map((failure) => (
          <li key={`${failure.row}-${failure.sku ?? ''}`}>
            <span className="numeric text-xs text-muted-foreground">Row {failure.row}</span>{' '}
            {failure.sku ? <span className="numeric text-xs">({failure.sku})</span> : null}{' '}
            <span className="text-destructive">
              {failure.errors.map((entry) => `${entry.field}: ${entry.message}`).join('; ')}
            </span>
          </li>
        ))}
        {failures.length > 30 ? (
          <li className="text-xs text-muted-foreground">
            …and {failures.length - 30} more.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ImportSummary({ result }: { result: BulkImportResult }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Created', value: result.created, tone: 'text-ok' },
          { label: 'Updated', value: result.updated, tone: '' },
          { label: 'Skipped', value: result.skipped, tone: 'text-caution' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-md border border-border p-3 text-center">
            <p className={cn('numeric text-2xl font-semibold', stat.tone)}>{stat.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {result.failed.length > 0 ? <FailureList failures={result.failed} /> : null}
    </div>
  );
}
