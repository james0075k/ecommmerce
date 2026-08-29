import type { Metadata } from 'next';

import { NEPAL_DISTRICTS, NEPAL_PROVINCES, PRODUCT_SORT_OPTIONS } from '@bazaar/shared';
import { formatPrice } from '@bazaar/ui';

import { Reveal, RevealItem, RevealList } from '@/components/animations/reveal';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { BuildManifest } from '@/components/shop/build-manifest';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Foundation',
  description: 'Phase 1 scaffold - design tokens, component library and service wiring.',
};

const BRAND_TOKENS = [
  { name: '--bz-primary', hex: '#6C3CE1', use: 'Buttons, links, active states' },
  { name: '--bz-secondary', hex: '#FF6B35', use: 'Sale badges, urgency' },
  { name: '--bz-success', hex: '#00C48C', use: 'In stock, verified' },
  { name: '--bz-error', hex: '#FF4757', use: 'Errors, out of stock' },
  { name: '--bz-warning', hex: '#F59E0B', use: 'Low stock, rating stars' },
];

const SURFACE_TOKENS = [
  { name: '--bz-bg', light: '#FAFBFC', dark: '#0B0E1A' },
  { name: '--bz-surface', light: '#FFFFFF', dark: '#161B2E' },
  { name: '--bz-text', light: '#1A1A2E', dark: '#E2E8F0' },
];

const BREAKPOINTS = [
  { name: 'xs', width: '< 480px', layout: 'Single column, bottom nav' },
  { name: 'md', width: '640-1023px', layout: '2-column grid, filters in a sheet' },
  { name: 'lg', width: '1024-1279px', layout: '3-column grid, sidebar filters' },
  { name: 'xl', width: '1280-1535px', layout: '4-column grid, full dashboard' },
  { name: '2xl', width: '1536px+', layout: 'Centred at 1440px' },
];

export default function FoundationPage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container-bazaar flex h-14 items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-lg font-extrabold tracking-tight">Bazaar</span>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              foundation
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container-bazaar space-y-20 py-12 md:py-16">
        {/* --- Manifest: what Phase 1 shipped, checked live ------------------ */}
        <Reveal className="mx-auto max-w-3xl space-y-6">
          <div className="space-y-3">
            <h1 className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-balance md:text-5xl">
              The foundation is in place.
            </h1>
            <p className="max-w-xl text-base text-muted-foreground text-pretty">
              No storefront yet - this page exists to prove the design system, the component
              library and both services are wired correctly before Phase 2 starts building on
              them.
            </p>
          </div>

          <BuildManifest />
        </Reveal>

        {/* --- H1: design tokens -------------------------------------------- */}
        <Section
          eyebrow="H1"
          title="Design tokens"
          description="Defined once in @bazaar/ui, mapped onto shadcn's variables so every component inherits the brand."
        >
          <RevealList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BRAND_TOKENS.map((token) => (
              <RevealItem key={token.name}>
                <div className="flex h-full items-center gap-3 rounded-md border border-border bg-card p-3">
                  <div
                    className="size-10 shrink-0 rounded-sm ring-1 ring-foreground/10"
                    style={{ backgroundColor: token.hex }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="numeric text-xs text-foreground">{token.hex}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {token.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{token.use}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </RevealList>

          <div className="mt-4 overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Surface
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Light
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Dark
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {SURFACE_TOKENS.map((token) => (
                  <tr key={token.name}>
                    <td className="px-3 py-2 font-mono text-xs">{token.name}</td>
                    <td className="numeric px-3 py-2 text-xs text-muted-foreground">
                      {token.light}
                    </td>
                    <td className="numeric px-3 py-2 text-xs text-muted-foreground">
                      {token.dark}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* --- Type ---------------------------------------------------------- */}
        <Section
          eyebrow="H1"
          title="Type"
          description="Three faces, three jobs. Mono is reserved for data - prices, SKUs, tracking numbers."
        >
          <div className="space-y-6">
            <TypeSpecimen role="Display" face="Plus Jakarta Sans">
              <p className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
                Flash sale ends in 2 hours
              </p>
            </TypeSpecimen>

            <TypeSpecimen role="Body" face="Inter">
              <p className="max-w-prose text-base text-muted-foreground">
                Premium cotton, pre-shrunk and colourfast. Free delivery inside the Kathmandu
                valley on orders over Rs 5,000.
              </p>
            </TypeSpecimen>

            <TypeSpecimen role="Mono" face="JetBrains Mono">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <span className="numeric text-2xl font-semibold">{formatPrice(2499)}</span>
                <span className="numeric text-sm text-muted-foreground line-through">
                  {formatPrice(3200)}
                </span>
                <span className="numeric text-sm text-muted-foreground">SKU BZR-TS-RED-XL</span>
                <span className="numeric text-sm text-muted-foreground">
                  ORD-20270815-4F2A
                </span>
              </div>
            </TypeSpecimen>
          </div>
        </Section>

        {/* --- Components ---------------------------------------------------- */}
        <Section
          eyebrow="B1.2"
          title="Components"
          description="shadcn/ui primitives on Radix, re-themed by the tokens above. Phases 3-9 compose these into the storefront."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Buttons</CardTitle>
                <CardDescription>Every variant, on brand.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button>Add to cart</Button>
                <Button variant="secondary">Save for later</Button>
                <Button variant="outline">Compare</Button>
                <Button variant="ghost">Details</Button>
                <Button variant="destructive">Remove</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display">Status badges</CardTitle>
                <CardDescription>Colour carries meaning, not decoration.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Badge className="bg-success text-white">In stock</Badge>
                <Badge className="bg-sale text-white">-22% today</Badge>
                <Badge className="bg-warning text-black">Only 3 left</Badge>
                <Badge variant="destructive">Out of stock</Badge>
                <Badge variant="outline">Pre-order</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display">Form controls</CardTitle>
                <CardDescription>
                  Validated by the Zod schemas in @bazaar/shared.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="demo-email">Email</Label>
                  <Input id="demo-email" type="email" placeholder="you@example.com" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="demo-coupon">Coupon code</Label>
                  <Input id="demo-coupon" placeholder="BAZAAR10" className="numeric" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display">Loading state</CardTitle>
                <CardDescription>
                  Skeletons with the H2 shimmer - never a blank page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="bz-shimmer h-24 w-full rounded-md" />
                <Skeleton className="bz-shimmer h-3 w-3/4" />
                <Skeleton className="bz-shimmer h-3 w-1/2" />
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* --- Shared data --------------------------------------------------- */}
        <Section
          eyebrow="C1.1"
          title="Shared domain data"
          description="Imported straight from @bazaar/shared - the same module the API validates against."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat value={String(NEPAL_DISTRICTS.length)} label="districts" sub="shipping zones" />
            <Stat value={String(NEPAL_PROVINCES.length)} label="provinces" sub="Koshi to Sudurpashchim" />
            <Stat
              value={String(PRODUCT_SORT_OPTIONS.length)}
              label="sort options"
              sub="price, newest, popular, rating"
            />
          </div>
        </Section>

        {/* --- H3: breakpoints ----------------------------------------------- */}
        <Section
          eyebrow="H3"
          title="Breakpoints"
          description="Mobile first. Resize the window - the grids above follow these."
        >
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Width
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Layout
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {BREAKPOINTS.map((bp) => (
                  <tr key={bp.name}>
                    <td className="px-3 py-2 font-mono text-xs">{bp.name}</td>
                    <td className="numeric px-3 py-2 text-xs text-muted-foreground">
                      {bp.width}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{bp.layout}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </main>

      <footer className="border-t border-border">
        <div className="container-bazaar flex flex-col gap-1 py-8">
          <p className="font-mono text-xs text-muted-foreground">
            Next up · Phase 2 - authentication and user management
          </p>
          <p className="text-xs text-muted-foreground">
            See README.md for the full 12-phase roadmap.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {/* The eyebrow is the blueprint's own section number, not decoration. */}
          <span className="font-mono text-xs tracking-widest text-primary uppercase">
            {eyebrow}
          </span>
          <Separator className="flex-1" />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground text-pretty">{description}</p>
      </div>
      {children}
    </Reveal>
  );
}

function TypeSpecimen({
  role,
  face,
  children,
}: {
  role: string;
  face: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 border-l-2 border-border pl-4">
      <div className="flex items-baseline gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="tracking-widest uppercase">{role}</span>
        <span aria-hidden>·</span>
        <span>{face}</span>
      </div>
      {children}
    </div>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="numeric text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
