'use client';

import { useQuery } from '@tanstack/react-query';
import { Headset, MapPin, Package, Truck } from 'lucide-react';

import { NEPAL_DISTRICTS } from '@bazaar/shared/constants';

import { NumberCounter } from '@/components/animations/number-counter';
import { StaggerChildren, StaggerItem } from '@/components/animations/stagger-children';
import { apiFetch } from '@/lib/api';
import type { ProductListResponse } from '@/lib/catalog';

/**
 * The reassurance strip under the hero.
 *
 * The product count is real - it comes off the pagination meta of a one-row
 * query, which is the cheapest way to ask the catalogue how big it is - so the
 * number counting up is a fact rather than a flourish.
 */
export function StoreStats() {
  const { data } = useQuery({
    queryKey: ['catalog-size'],
    queryFn: () => apiFetch<ProductListResponse>('/products?limit=1'),
    staleTime: 5 * 60_000,
  });

  const productCount = data?.meta.total ?? 0;

  const stats = [
    {
      icon: Package,
      value: productCount,
      suffix: productCount > 0 ? '+' : '',
      label: 'products in stock',
      pending: productCount === 0,
    },
    {
      icon: MapPin,
      value: NEPAL_DISTRICTS.length,
      suffix: '',
      label: 'districts covered',
      pending: false,
    },
    { icon: Truck, value: 48, suffix: 'h', label: 'typical delivery', pending: false },
    { icon: Headset, value: 7, suffix: ' days', label: 'support, every week', pending: false },
  ];

  return (
    // Pulled up over the foot of the hero, and raised above it: the hero sets
    // `isolate`, so without an explicit stacking position this card would be
    // painted behind the gradient it is meant to overlap.
    <section className="container-bazaar relative z-10 -mt-8 md:-mt-10">
      <StaggerChildren
        stagger={0.08}
        amount={0.3}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border shadow-card lg:grid-cols-4"
      >
        {stats.map(({ icon: Icon, value, suffix, label, pending }) => (
          <StaggerItem key={label} className="bg-card">
            <div className="flex h-full items-center gap-3 p-4 md:p-5">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"
              >
                <Icon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-xl font-medium tracking-[-0.02em] md:text-2xl">
                  {pending ? (
                    <span className="numeric text-muted-foreground">—</span>
                  ) : (
                    <NumberCounter value={value} suffix={suffix} />
                  )}
                </p>
                <p className="text-xs text-muted-foreground text-pretty">{label}</p>
              </div>
            </div>
          </StaggerItem>
        ))}
      </StaggerChildren>
    </section>
  );
}
