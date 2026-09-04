'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { AI_TONE_OPTIONS } from '@bazaar/shared';
import type { AiTone, GeneratedDescription } from '@bazaar/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { generateProductDescription } from '@/lib/ai';
import { ApiError } from '@/lib/api';

/** What the form knows about the product, and what the copywriter needs. */
export interface ProductBrief {
  productName: string;
  category?: string;
  brand?: string;
  attributes: Record<string, string>;
  tags: string[];
  price?: number;
}

/**
 * E1: "Generate with AI" on the product form.
 *
 * Two steps on purpose - generate, then apply. The draft is shown before it
 * touches the form because the form is what the admin has already been typing
 * into, and silently overwriting a half-written description with a model's
 * guess is the kind of "help" that makes people stop clicking the button.
 *
 * Applying only fills the fields; saving the product is still a separate,
 * deliberate act.
 */
export function GenerateDescriptionDialog({
  brief,
  disabled,
  onApply,
}: {
  brief: ProductBrief;
  disabled?: boolean;
  onApply: (result: GeneratedDescription) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [tone, setTone] = React.useState<AiTone>('professional');
  const [result, setResult] = React.useState<GeneratedDescription | null>(null);

  const generate = useMutation({
    mutationFn: () => generateProductDescription({ ...brief, tone }),
    onSuccess: setResult,
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiError ? error.message : 'Could not generate a description.',
      ),
  });

  const open = () => {
    if (!brief.productName.trim()) {
      toast.error('Give the product a name first — the copywriter needs something to go on.');
      return;
    }
    setResult(null);
    setIsOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={open}
        disabled={disabled}
        className="gap-1.5"
      >
        <Sparkles className="size-3.5" aria-hidden />
        Generate with AI
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Generate a description</DialogTitle>
            <DialogDescription>
              Written for the Nepal market in English and Nepali. Review it before applying —
              nothing is saved until you save the product.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="ai-tone">Tone</Label>
            <Select value={tone} onValueChange={(value) => setTone(value as AiTone)}>
              <SelectTrigger id="ai-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_TONE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label} — {option.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <dl className="rounded-md border border-border p-3 text-sm">
            <BriefRow label="Product" value={brief.productName} />
            <BriefRow label="Category" value={brief.category} />
            <BriefRow label="Brand" value={brief.brand} />
            <BriefRow
              label="Price"
              value={brief.price ? `Rs ${brief.price.toLocaleString('en-IN')}` : undefined}
            />
            <BriefRow
              label="Attributes"
              value={
                Object.entries(brief.attributes)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(', ') || undefined
              }
            />
          </dl>

          {result ? <Preview result={result} /> : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Writing…
                </>
              ) : result ? (
                'Try again'
              ) : (
                'Generate'
              )}
            </Button>
            <Button
              type="button"
              disabled={!result}
              onClick={() => {
                if (!result) return;
                onApply(result);
                setIsOpen(false);
                toast.success('Draft applied. Edit it, then save the product.');
              }}
            >
              Use this draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BriefRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;

  return (
    <div className="flex gap-3 py-0.5">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
}

function Preview({ result }: { result: GeneratedDescription }) {
  return (
    <div className="space-y-4">
      <Section title="English">
        <p className="text-sm text-muted-foreground">{result.english.shortDescription}</p>
        <div
          className="mt-2 text-sm leading-relaxed [&_h4]:mb-1 [&_h4]:mt-3 [&_h4]:font-medium [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2"
          dangerouslySetInnerHTML={{ __html: result.english.descriptionHtml }}
        />
      </Section>

      <Section title="नेपाली">
        <p className="text-sm text-muted-foreground">{result.nepali.shortDescription}</p>
        <div
          className="mt-2 text-sm leading-relaxed [&_h4]:mb-1 [&_h4]:mt-3 [&_h4]:font-medium [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2"
          dangerouslySetInnerHTML={{ __html: result.nepali.descriptionHtml }}
        />
      </Section>

      <Section title="SEO">
        <p className="text-sm">
          <span className="text-muted-foreground">Title: </span>
          {result.metaTitle}
        </p>
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Description: </span>
          {result.metaDescription}
        </p>
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Keywords: </span>
          {result.keywords.join(', ')}
        </p>
      </Section>

      <p className="text-xs text-muted-foreground">Written by {result.model}.</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border p-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
