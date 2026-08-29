'use client';

import * as React from 'react';
import { ChevronRight, X } from 'lucide-react';

import { formatPrice } from '@bazaar/ui';
import type { CatalogFacets } from '@bazaar/shared';

import { StarRating } from '@/components/shop/star-rating';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { CategoryNode } from '@/lib/catalog';
import { cn } from '@/lib/utils';

export interface FilterState {
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
}

export function CatalogFilters({
  categories,
  facets,
  value,
  onChange,
  onClear,
}: {
  categories: CategoryNode[];
  facets: CatalogFacets;
  value: FilterState;
  onChange: (next: Partial<FilterState>) => void;
  onClear: () => void;
}) {
  const activeCount = Object.values(value).filter(
    (entry) => entry !== undefined && entry !== false,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold tracking-tight">Filters</h2>
        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-xs">
            <X className="size-3" />
            Clear all
          </Button>
        ) : null}
      </div>

      <FilterSection title="Category">
        <CategoryTree
          nodes={categories}
          selected={value.category}
          onSelect={(slug) => onChange({ category: slug === value.category ? undefined : slug })}
        />
      </FilterSection>

      <FilterSection title="Price">
        <PriceRange
          min={facets.priceRange.min}
          max={facets.priceRange.max}
          value={value}
          onChange={onChange}
        />
      </FilterSection>

      {facets.brands.length > 0 ? (
        <FilterSection title="Brand">
          <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {facets.brands.map((brand) => (
              <li key={brand.value} className="flex items-center gap-2.5">
                <Checkbox
                  id={`brand-${brand.value}`}
                  checked={value.brand === brand.value}
                  onCheckedChange={(checked) =>
                    onChange({ brand: checked ? brand.value : undefined })
                  }
                />
                <Label
                  htmlFor={`brand-${brand.value}`}
                  className="flex flex-1 cursor-pointer items-center justify-between text-sm font-normal"
                >
                  <span className="truncate">{brand.value}</span>
                  <span className="numeric text-xs text-muted-foreground">{brand.count}</span>
                </Label>
              </li>
            ))}
          </ul>
        </FilterSection>
      ) : null}

      <FilterSection title="Rating">
        <ul className="space-y-1">
          {[4, 3, 2].map((stars) => (
            <li key={stars}>
              <button
                type="button"
                onClick={() => onChange({ rating: value.rating === stars ? undefined : stars })}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  value.rating === stars
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <StarRating rating={stars} size="sm" />
                <span className="text-muted-foreground">&amp; up</span>
              </button>
            </li>
          ))}
        </ul>
      </FilterSection>

      <FilterSection title="Availability">
        <div className="flex items-center justify-between">
          <Label htmlFor="in-stock" className="cursor-pointer text-sm font-normal">
            In stock only
          </Label>
          <Switch
            id="in-stock"
            checked={value.inStock ?? false}
            onCheckedChange={(checked) => onChange({ inStock: checked || undefined })}
          />
        </div>
      </FilterSection>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-5 first:border-0 first:pt-0">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/** Collapsible tree. The branch containing the selection opens automatically. */
function CategoryTree({
  nodes,
  selected,
  onSelect,
  depth = 0,
}: {
  nodes: CategoryNode[];
  selected?: string;
  onSelect: (slug: string) => void;
  depth?: number;
}) {
  return (
    <ul className={cn('space-y-0.5', depth > 0 && 'mt-0.5 ml-3 border-l border-border pl-2')}>
      {nodes.map((node) => (
        <CategoryBranch
          key={node.id}
          node={node}
          selected={selected}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </ul>
  );
}

function CategoryBranch({
  node,
  selected,
  onSelect,
  depth,
}: {
  node: CategoryNode;
  selected?: string;
  onSelect: (slug: string) => void;
  depth: number;
}) {
  const containsSelection = React.useMemo(
    () => (selected ? subtreeContains(node, selected) : false),
    [node, selected],
  );

  // `null` means "follow the selection". Clicking the chevron pins it open or
  // closed. Deriving it this way means a filter arriving from the URL opens the
  // right branch with no effect syncing state after the fact.
  const [pinned, setPinned] = React.useState<boolean | null>(null);
  const open = pinned ?? (containsSelection || depth === 0);

  const hasChildren = node.children.length > 0;
  const isSelected = selected === node.slug;

  return (
    <li>
      <div className="flex items-center gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setPinned(!open)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform duration-200', open && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelect(node.slug)}
          aria-current={isSelected ? 'true' : undefined}
          className={cn(
            'flex flex-1 items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors',
            isSelected ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-muted',
          )}
        >
          <span className="truncate">{node.name}</span>
          <span className="numeric text-xs text-muted-foreground">{node.productCount}</span>
        </button>
      </div>

      {hasChildren && open ? (
        <CategoryTree
          nodes={node.children}
          selected={selected}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ) : null}
    </li>
  );
}

function subtreeContains(node: CategoryNode, slug: string): boolean {
  if (node.slug === slug) return true;
  return node.children.some((child) => subtreeContains(child, slug));
}

/* -------------------------------------------------------------------------- */

/**
 * Dual-thumb price slider. The committed value drives the query; dragging only
 * updates local state so every pixel of movement is not a request.
 */
function PriceRange({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: FilterState;
  onChange: (next: Partial<FilterState>) => void;
}) {
  const safeMax = max > min ? max : min + 1000;
  const committed: [number, number] = [value.minPrice ?? min, value.maxPrice ?? safeMax];

  // `null` while idle, a tuple only while a thumb is being dragged. The
  // committed URL value is the source of truth, so clearing filters or hitting
  // back moves the thumbs with no effect syncing them afterwards.
  const [dragging, setDragging] = React.useState<[number, number] | null>(null);
  const range = dragging ?? committed;

  return (
    <div className="space-y-3 px-1">
      <Slider
        min={min}
        max={safeMax}
        step={Math.max(1, Math.round((safeMax - min) / 100))}
        value={range}
        onValueChange={(next) => setDragging([next[0] ?? min, next[1] ?? safeMax])}
        onValueCommit={(next) => {
          setDragging(null);
          onChange({
            minPrice: next[0] === min ? undefined : next[0],
            maxPrice: next[1] === safeMax ? undefined : next[1],
          });
        }}
        aria-label="Price range"
      />
      <div className="flex items-center justify-between">
        <span className="numeric text-xs text-muted-foreground">{formatPrice(range[0])}</span>
        <span className="numeric text-xs text-muted-foreground">{formatPrice(range[1])}</span>
      </div>
    </div>
  );
}
