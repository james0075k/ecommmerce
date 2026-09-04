'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';

import { slugify } from '@bazaar/ui';

import { ImageUploader, type ImageDraft } from '@/components/admin/image-uploader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, apiFetch } from '@/lib/api';
import type { CategoryNode, ProductDetail } from '@/lib/catalog';

/**
 * TipTap plus ProseMirror is the heaviest thing the admin panel loads, and it
 * serves one field on one form (Phase 11). Splitting it out keeps it off the
 * product *list*, which shares a route chunk with this form's page, and lets
 * the rest of the form paint while the editor is still arriving.
 *
 * `ssr: false` because ProseMirror builds its document against a real DOM;
 * there is nothing useful to render on the server. The skeleton matches the
 * editor's own height so the form does not reflow when it lands.
 */
const RichTextEditor = dynamic(
  () => import('@/components/admin/rich-text-editor').then((mod) => mod.RichTextEditor),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-md" /> },
);

interface VariantDraft {
  id?: string;
  sku: string;
  name: string;
  priceOverride: number | null;
  stockQuantity: number;
  attributes: Record<string, string>;
  isActive: boolean;
}

export function ProductForm({ product }: { product?: ProductDetail }) {
  const router = useRouter();
  const editing = !!product;

  const [name, setName] = React.useState(product?.name ?? '');
  // Only holds a value once the admin edits it by hand; until then the slug is
  // derived from the name during render rather than synced by an effect.
  const [slugOverride, setSlugOverride] = React.useState<string | null>(
    product?.slug ?? null,
  );
  const [sku, setSku] = React.useState(product?.sku ?? '');
  const [shortDescription, setShortDescription] = React.useState(
    product?.shortDescription ?? '',
  );
  const [description, setDescription] = React.useState(product?.description ?? '');
  const [basePrice, setBasePrice] = React.useState(String(product?.basePrice ?? ''));
  const [compareAtPrice, setCompareAtPrice] = React.useState(
    product?.compareAtPrice ? String(product.compareAtPrice) : '',
  );
  const [categoryId, setCategoryId] = React.useState(product?.category.id ?? '');
  const [brand, setBrand] = React.useState(product?.brand ?? '');
  const [tags, setTags] = React.useState<string[]>(product?.tags ?? []);
  const [tagDraft, setTagDraft] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [isFeatured, setIsFeatured] = React.useState(product?.isFeatured ?? false);
  const [metaTitle, setMetaTitle] = React.useState(product?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = React.useState(product?.metaDescription ?? '');

  const [images, setImages] = React.useState<ImageDraft[]>(
    product?.images.map((image, index) => ({
      url: image.url,
      altText: image.altText,
      isPrimary: image.isPrimary,
      sortOrder: index,
    })) ?? [],
  );

  const [variants, setVariants] = React.useState<VariantDraft[]>(
    product?.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      priceOverride: variant.priceOverride,
      stockQuantity: variant.stockQuantity,
      attributes: variant.attributes,
      isActive: variant.isActive,
    })) ?? [],
  );

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => apiFetch<CategoryNode[]>('/categories?includeInactive=true'),
  });

  const slug = slugOverride ?? slugify(name);

  const save = async () => {
    setError(null);

    const price = Number(basePrice);
    if (!name || !sku || !categoryId || !Number.isFinite(price)) {
      setError('Name, SKU, category and price are all required.');
      return;
    }

    setSaving(true);

    const payload = {
      sku,
      name,
      slug,
      shortDescription: shortDescription || null,
      description: description || null,
      basePrice: price,
      compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
      categoryId,
      brand: brand || null,
      tags,
      isActive,
      isFeatured,
      status: isActive ? 'ACTIVE' : 'DRAFT',
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      images: images.map((image, index) => ({ ...image, sortOrder: index })),
      variants,
    };

    try {
      if (editing) {
        await apiFetch(`/admin/products/${product.id}`, { method: 'PATCH', body: payload });
        toast.success('Product saved.');
      } else {
        await apiFetch('/admin/products', { method: 'POST', body: payload });
        toast.success('Product created.');
      }
      router.push('/admin/products');
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.fieldErrors.length
            ? caught.fieldErrors.map((entry) => `${entry.field}: ${entry.message}`).join(' · ')
            : caught.message,
        );
      } else {
        setError('Could not save the product.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {editing ? 'Edit product' : 'New product'}
          </h1>
          {editing ? (
            <p className="numeric mt-1 text-sm text-muted-foreground">{product.sku}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/products')}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="name" label="Name" value={name} onChange={setName} />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="slug"
                  label="Slug"
                  value={slug}
                  onChange={setSlugOverride}
                  hint="Appears in the product URL."
                  className="numeric"
                />
                <Field id="sku" label="SKU" value={sku} onChange={setSku} className="numeric" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="shortDescription">Short description</Label>
                <Textarea
                  id="shortDescription"
                  rows={2}
                  value={shortDescription}
                  onChange={(event) => setShortDescription(event.target.value)}
                  placeholder="One line shown on the product card."
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <RichTextEditor value={description} onChange={setDescription} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Images</CardTitle>
              <CardDescription>
                Drag files in to upload, drag tiles to reorder. The first is the primary one;
                blurhash is generated server-side on save.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImageUploader images={images} onChange={setImages} />
            </CardContent>
          </Card>

          <VariantsCard variants={variants} setVariants={setVariants} baseSku={sku} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="basePrice"
                label="Price (NPR)"
                value={basePrice}
                onChange={setBasePrice}
                type="number"
                className="numeric"
              />
              <Field
                id="compareAtPrice"
                label="Compare-at price"
                value={compareAtPrice}
                onChange={setCompareAtPrice}
                type="number"
                hint="Higher than the price. Shown struck through."
                className="numeric"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Organisation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {flatten(categories ?? []).map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {' '.repeat(entry.depth * 3)}
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Field id="brand" label="Brand" value={brand} onChange={setBrand} />

              <div className="grid gap-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const tag = tagDraft.trim().toLowerCase();
                    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
                    setTagDraft('');
                  }}
                  placeholder="Type a tag and press Enter"
                />
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="cursor-pointer gap-1 hover:bg-muted"
                        onClick={() => setTags(tags.filter((entry) => entry !== tag))}
                      >
                        {tag}
                        <X className="size-3" />
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Toggle id="isActive" label="Active" checked={isActive} onChange={setIsActive} />
              <Toggle
                id="isFeatured"
                label="Featured"
                checked={isFeatured}
                onChange={setIsFeatured}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">SEO</CardTitle>
              <CardDescription>Falls back to the product name if left blank.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="metaTitle"
                label="Meta title"
                value={metaTitle}
                onChange={setMetaTitle}
                hint={`${metaTitle.length}/70`}
              />
              <div className="grid gap-2">
                <Label htmlFor="metaDescription">Meta description</Label>
                <Textarea
                  id="metaDescription"
                  rows={3}
                  maxLength={160}
                  value={metaDescription}
                  onChange={(event) => setMetaDescription(event.target.value)}
                />
                <p className="numeric text-xs text-muted-foreground">
                  {metaDescription.length}/160
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

/** Variant matrix builder: define option sets, generate every combination. */
function VariantsCard({
  variants,
  setVariants,
  baseSku,
}: {
  variants: VariantDraft[];
  setVariants: (next: VariantDraft[]) => void;
  baseSku: string;
}) {
  const [optionName, setOptionName] = React.useState('');
  const [optionValues, setOptionValues] = React.useState('');
  const [options, setOptions] = React.useState<Record<string, string[]>>({});

  const generate = () => {
    const names = Object.keys(options);
    if (names.length === 0 || !baseSku) return;

    const combinations = names.reduce<Array<Record<string, string>>>(
      (acc, name) =>
        acc.flatMap((partial) =>
          (options[name] ?? []).map((value) => ({ ...partial, [name]: value })),
        ),
      [{}],
    );

    const existing = new Set(variants.map((variant) => variant.sku));

    const generated = combinations
      .map((attributes) => {
        const suffix = Object.values(attributes)
          .map((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
          .join('-');
        return {
          sku: `${baseSku}-${suffix}`,
          name: Object.values(attributes).join(' / '),
          priceOverride: null,
          stockQuantity: 0,
          attributes,
          isActive: true,
        } satisfies VariantDraft;
      })
      // Regenerating must not clobber stock already entered for a combination.
      .filter((variant) => !existing.has(variant.sku));

    setVariants([...variants, ...generated]);
    toast.success(`Added ${generated.length} variants.`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Variants</CardTitle>
        <CardDescription>
          Define options, then generate every combination. Stock is tracked per variant.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <Input
            value={optionName}
            onChange={(event) => setOptionName(event.target.value)}
            placeholder="Option (Size)"
          />
          <Input
            value={optionValues}
            onChange={(event) => setOptionValues(event.target.value)}
            placeholder="Values, comma separated (S, M, L)"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const values = optionValues
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
              if (!optionName.trim() || values.length === 0) return;
              setOptions({ ...options, [optionName.trim()]: values });
              setOptionName('');
              setOptionValues('');
            }}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        {Object.keys(options).length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(options).map(([name, values]) => (
              <Badge
                key={name}
                variant="outline"
                className="cursor-pointer gap-1 hover:bg-muted"
                onClick={() => {
                  const next = { ...options };
                  delete next[name];
                  setOptions(next);
                }}
              >
                {name}: {values.join(', ')}
                <X className="size-3" />
              </Badge>
            ))}
            <Button type="button" size="sm" onClick={generate} disabled={!baseSku}>
              <Wand2 className="size-4" />
              Generate {countCombinations(options)} variants
            </Button>
          </div>
        ) : null}

        {!baseSku ? (
          <p className="text-xs text-caution">Set the product SKU first — variant SKUs derive from it.</p>
        ) : null}

        {variants.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-xs tracking-wider text-muted-foreground uppercase">
                  <th className="px-3 py-2 text-left font-medium">Variant</th>
                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Stock</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {variants.map((variant, index) => (
                  <tr key={variant.sku}>
                    <td className="px-3 py-2">{variant.name}</td>
                    <td className="numeric px-3 py-2 text-xs">{variant.sku}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        aria-label={`Price override for ${variant.name}`}
                        value={variant.priceOverride ?? ''}
                        placeholder="base"
                        onChange={(event) =>
                          setVariants(
                            variants.map((entry, position) =>
                              position === index
                                ? {
                                    ...entry,
                                    priceOverride: event.target.value
                                      ? Number(event.target.value)
                                      : null,
                                  }
                                : entry,
                            ),
                          )
                        }
                        className="numeric h-8 w-24 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        aria-label={`Stock for ${variant.name}`}
                        value={variant.stockQuantity}
                        onChange={(event) =>
                          setVariants(
                            variants.map((entry, position) =>
                              position === index
                                ? { ...entry, stockQuantity: Number(event.target.value) || 0 }
                                : entry,
                            ),
                          )
                        }
                        className="numeric h-8 w-20 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${variant.name}`}
                        onClick={() =>
                          setVariants(variants.filter((_, position) => position !== index))
                        }
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            No variants yet. A product with none is sold as a single item.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function countCombinations(options: Record<string, string[]>): number {
  return Object.values(options).reduce((total, values) => total * values.length, 1);
}

/* -------------------------------------------------------------------------- */

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  className,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  className?: string;
  type?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="cursor-pointer font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Flattens the category tree into indented options. */
function flatten(
  nodes: CategoryNode[],
  depth = 0,
): Array<{ id: string; name: string; depth: number }> {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, depth },
    ...flatten(node.children, depth + 1),
  ]);
}
