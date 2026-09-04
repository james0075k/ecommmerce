# Bazaar

**A next-generation ecommerce platform for Nepal and the world.**

Bazaar is a full-stack storefront and admin platform built around three things most
platforms in this market get wrong: native Nepali payment rails (eSewa, Khalti, ConnectIPS,
Fonepay, IME Pay), district- and province-aware shipping across all 77 districts, and a
design system built for sharing — scroll animations, micro-interactions, dark mode by
default.

This repository implements the blueprint in `../bazaar-ecommerce-blueprint.pdf` across
12 phases. **Phases 1–11 are complete** — the foundation, authentication and user
management, the product catalog, cart and wishlist, checkout and payments, order
management, reviews and search, the admin dashboard, the homepage and animation pass, the
AI features, and the mobile and performance work. Phase 12 (deployment) is outlined in the
[roadmap](#roadmap) below.

---

## Table of contents

- [Stack](#stack)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Database](#database)
- [Authentication](#authentication)
- [Catalog](#catalog)
- [Design system](#design-system)
- [Security model](#security-model)
- [Payments](#payments)
- [Orders](#orders)
- [Mobile and performance](#mobile-and-performance)
- [Roadmap](#roadmap)
- [Environment variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Infrastructure and cost](#infrastructure-and-cost)

---

## Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router) + React 19 | Server components, Turbopack, React Compiler |
| Styling | Tailwind CSS 4 + shadcn/ui (Radix) | Tokens from blueprint Part H |
| Animation | Framer Motion 12 | Presets in `@bazaar/ui` mirror the H2 catalog |
| Backend | NestJS 11 (TypeScript) | Modular, `/api/v1` namespaced |
| Database | PostgreSQL 17+ | JSONB, arrays, GIN indexes, native FTS |
| ORM | Prisma 6 | Type-safe; **no raw SQL in application code** |
| Cache / queues | Redis 8 + BullMQ | Sessions, rate limits, background jobs |
| Search | Meilisearch | Instant, typo-tolerant, faceted |
| Storage | AWS S3 + CloudFront | Presigned uploads, CDN delivery |
| Auth | NextAuth v5 + JWT + OAuth2 | Argon2id hashing, HttpOnly refresh cookies |
| Email / SMS | Resend + Sparrow SMS | Transactional email, Nepali OTP |
| Realtime | Socket.IO | Order tracking, admin notifications |
| AI | Claude API | Descriptions, chatbot, recommendations |
| Monorepo | pnpm workspaces + Turborepo 2 | Five packages, shared configs |

> **Note on versions.** The blueprint specifies Next.js 15 and this scaffold installs
> **Next.js 16**, because the blueprint's own instruction is `create-next-app@latest`. The App
> Router surface Phase 1 uses is unchanged. Pin to 15 in `apps/web/package.json` if you prefer
> to match the document literally.
>
> The NestJS CLI now scaffolds **Nest 12**, but `@nestjs/throttler` — which the blueprint
> requires for rate limiting — has no Nest 12 release yet. `apps/api` is therefore pinned to
> **Nest 11**, where the whole ecosystem is supported. Revisit when throttler ships Nest 12
> support.

---

## Architecture

```
                         ┌──────────────────────────────────┐
   Browser / PWA ───────▶│  Next.js 16 (Vercel Edge)        │
                         │  RSC · SSR/SSG · route handlers  │
                         └───────────────┬──────────────────┘
                                         │ REST /api/v1  (+ Socket.IO)
                                         ▼
                         ┌──────────────────────────────────┐
                         │  NestJS API                      │
                         │  guards · pipes · interceptors   │
                         ├──────────────────────────────────┤
                         │  Domain modules                  │
                         │  auth · products · orders ·      │
                         │  payments · cart · reviews · ai  │
                         ├──────────────────────────────────┤
                         │  Prisma 6  (only data path)      │
                         └───┬───────┬────────┬────────┬────┘
                             │       │        │        │
                    ┌────────▼─┐ ┌───▼───┐ ┌──▼─────┐ ┌▼────────┐
                    │ Postgres │ │ Redis │ │ Meili  │ │ S3/CDN  │
                    │ 17       │ │  8    │ │ search │ │ media   │
                    └──────────┘ └───────┘ └────────┘ └─────────┘

  Cross-cutting: Resend (email) · Sparrow SMS (OTP) · payment gateways ·
                 Claude API · Sentry / PostHog
```

Requests never reach the database without passing a Zod schema first; the same schemas in
`@bazaar/shared` validate frontend forms and backend DTOs, so a contract change breaks both
sides at build time rather than in production.

---

## Repository layout

```
bazaar/
├── apps/
│   ├── web/                  Next.js storefront + admin        → :3000
│   │   └── src/
│   │       ├── app/(shop)/       storefront routes
│   │       ├── app/(auth)/       login, register, password reset
│   │       ├── app/(admin)/      dashboard, products, orders
│   │       ├── components/ui/    shadcn primitives (16)
│   │       ├── components/       shop · admin · layout · animations
│   │       └── lib/              api client, stores, hooks
│   └── api/                  NestJS API                        → :4000
│       └── src/
│           ├── auth/ users/ products/ categories/ orders/ cart/
│           ├── payments/ reviews/ wishlist/ search/ coupons/
│           ├── shipping/ notifications/ analytics/ admin/ upload/ ai/
│           ├── common/       guards · filters · pipes · interceptors
│           ├── prisma/       connection lifecycle
│           └── health/       GET /api/v1/health
├── packages/
│   ├── shared/               types · Zod schemas · enums · constants
│   ├── ui/                   design tokens · animations · cn() · motion presets
│   └── config/               tsconfig + ESLint bases
├── prisma/
│   ├── schema.prisma         27 models
│   ├── seed.ts               store settings defaults
│   └── migrations/README.md  raw SQL that Prisma's DSL can't express
├── docker-compose.yml        Postgres 17 · Redis 8 · Meilisearch
├── turbo.json
└── pnpm-workspace.yaml
```

Empty module directories under `apps/api/src` are intentional — they mark the module map from
blueprint B1.3 and are filled in by later phases.

### Why `shamefully-hoist`

`.npmrc` sets `shamefully-hoist=true`. The Prisma schema lives at the repository root, so a
single generated client must be resolvable from `apps/api`. Hoisting achieves that without
inventing a `packages/db` the blueprint does not specify. If you later split Prisma into its
own package, this flag can go.

---

## Getting started

### Prerequisites

- **Node.js 20.11+** (22 recommended — see `.nvmrc`)
- **pnpm 11+** — `corepack enable && corepack prepare pnpm@latest --activate`
- **PostgreSQL 17+**, plus Redis 8 and Meilisearch for search and queues

### 1. Install

```bash
pnpm install
```

This also runs `prisma generate`, so the typed client exists before anything compiles.

### 2. Configure

```bash
cp .env.example .env
```

Then fill in at minimum `DATABASE_URL`, `JWT_SECRET` and `JWT_REFRESH_SECRET` (both ≥32
characters). The API validates its environment at boot with Zod and refuses to start on a
placeholder secret, so a misconfiguration fails loudly and immediately.

### 3. Start the services

**With Docker** (brings up all three at the versions the blueprint specifies):

```bash
docker compose up -d
docker compose ps        # all three should report healthy
```

**Without Docker**, if PostgreSQL is already installed locally, create the role and database
and point `DATABASE_URL` at them:

```sql
CREATE ROLE bazaar WITH LOGIN PASSWORD 'bazaar_dev_password';
CREATE DATABASE bazaar OWNER bazaar;
```

Redis and Meilisearch are not needed until Phases 4 and 7 respectively.

### 4. Create the schema

```bash
pnpm db:push      # apply schema.prisma to the database
pnpm db:seed      # insert store settings defaults
pnpm db:studio    # browse the tables at localhost:5555
```

### 5. Run

```bash
pnpm dev
```

| Service | URL |
| --- | --- |
| Storefront | http://localhost:3000 |
| API | http://localhost:4000/api/v1 |
| Health check | http://localhost:4000/api/v1/health |
| Prisma Studio | http://localhost:5555 (`pnpm db:studio`) |

The page at `localhost:3000` is the storefront homepage: hero carousel, category bento, flash
sale, trending grid, testimonials, brand marquee and newsletter. Every section fetches its own
data and degrades on its own - if the API is down the hero, testimonials and footer still
render, and the catalogue sections stand themselves down rather than showing an empty shelf.

The app is installable as a PWA. The service worker only registers in a production build
(`pnpm --filter @bazaar/web build && pnpm --filter @bazaar/web start`); in development it is
deliberately unregistered so a cached dev bundle never masks an edit.

---

## Scripts

Run from the repository root.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Starts web (:3000) and api (:4000) together via Turborepo |
| `pnpm build` | Production build of every package |
| `pnpm lint` | ESLint across all workspaces |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces |
| `pnpm format` | Prettier write (Tailwind class sorting included) |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:push` | Push `schema.prisma` to the database (no migration files) |
| `pnpm db:migrate` | Create and apply a named migration |
| `pnpm db:seed` | Seed store settings defaults |
| `pnpm db:blurhash` | Derive blur-up placeholders for product images that have none |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:reset` | Drop, recreate, re-migrate and re-seed |
| `pnpm clean` | Remove build artifacts and `node_modules` |

Run from `apps/web`:

| Script | What it does |
| --- | --- |
| `pnpm analyze` | Production build with the bundle treemaps (`ANALYZE=true`) |

Use `pnpm db:push` while iterating on the schema; switch to `pnpm db:migrate` once the
database holds data you care about.

---

## Database

27 models, PostgreSQL-native throughout: JSONB for flexible product attributes, `text[]` for
tags, native enums, and GIN indexes where they matter.

| Group | Tables |
| --- | --- |
| Users & auth | `users`, `addresses`, `sessions`, `oauth_accounts`, `password_reset_tokens` |
| Catalog | `categories`, `products`, `product_variants`, `product_images`, `product_videos`, `inventory` |
| Orders | `orders`, `order_items`, `payments`, `refunds`, `order_status_history` |
| Commerce | `reviews`, `coupons`, `coupon_usage`, `wishlists`, `cart_items` |
| Admin & analytics | `admin_activity_log`, `page_views`, `revenue_daily`, `store_settings`, `notifications`, `contact_messages` |

Models are PascalCase in Prisma and snake_case in Postgres, so `psql` sessions and analytics
queries read naturally.

**Design decisions worth knowing:**

- **Order lines are immutable snapshots.** `order_items` stores the product name, SKU, price and
  a full JSONB snapshot at purchase time. Editing or deleting a product never rewrites history.
- **Addresses are snapshotted onto orders.** A customer editing their address book does not
  change where a past order was shipped.
- **Financial records survive account deletion.** `orders` and `reviews` use `onDelete: SetNull`;
  personal data (`addresses`, `sessions`, `cart_items`, `wishlists`, `notifications`) cascades.
- **One review per product per user**, enforced by a unique constraint rather than app logic.
- **Two C1.6 indexes are not in the schema** — the tsvector full-text index and monthly
  partitioning of `page_views` — because Prisma's DSL cannot express them. Both are written out
  as ready-to-apply SQL in [`prisma/migrations/README.md`](prisma/migrations/README.md), with the
  phase each belongs to.

---

## Authentication

The NestJS API is the authority on identity. The frontend holds no long-lived secret.

### Token model

| Token | Lifetime | Where it lives | Why |
| --- | --- | --- | --- |
| Access | 15 min | Memory only (a module variable in `lib/api.ts`) | D1: "No JWT in localStorage" — it dies with the tab |
| Refresh | 7 days | `bz_refresh`, HttpOnly + SameSite=Lax cookie | JavaScript cannot read it, so XSS cannot steal it |

On load the app POSTs `/auth/refresh` with the cookie and gets a new access token — a hard
refresh restores the session without a re-login. A 401 mid-session triggers one refresh and
replays the request; concurrent 401s share a single refresh rather than stampeding.

Every refresh token is **rotated** on use and its SHA-256 hash is stored in the `sessions`
table. Presenting a superseded token is treated as a replay and revokes the whole session.

### Sign-in methods

- **Email + password** — Argon2id (19 MiB memory cost, OWASP minimum). Email must be verified
  first. 5 failed attempts per address locks login for 15 minutes.
- **Phone OTP** — 6-digit code, hashed in Redis with a 5-minute TTL, 60-second resend cooldown,
  5 verification attempts. A verified number creates the account if it does not exist.
- **Google OAuth** — auto-creates or links an account. The access token returns in the URL
  *fragment*, which browsers never send to a server; the callback page strips it from history
  immediately.

### Authorisation

`JwtAuthGuard` is registered globally, so **every route requires a token unless it is marked
`@Public()`** — forgetting a decorator locks a route down rather than exposing it. `RolesGuard`
enforces `@Roles('ADMIN')`, with `SUPER_ADMIN` satisfying any admin requirement. The JWT
strategy re-reads the user on every request, so suspending an account takes effect immediately
instead of waiting out the token lifetime.

On the frontend, `proxy.ts` (Next 16's replacement for `middleware.ts`) verifies the refresh
cookie's signature at the edge and guards `/account`, `/orders`, `/wishlist` and `/admin`. A
non-admin hitting `/admin` gets the same redirect a signed-out visitor gets — confirming the
route exists is information they do not need.

### Running without the optional services

Auth depends on Redis, Resend, Sparrow SMS, Google and S3. All five are optional in
development; each degrades with a warning at boot rather than blocking the flow:

| Missing | Behaviour |
| --- | --- |
| `REDIS_URL` unreachable | An in-process store takes over. OTP and token revocation work, but do not survive a restart and are **not** safe across multiple instances. `/health` reports `cache: memory`. |
| `RESEND_API_KEY` | Emails are logged to the API console — the verification and reset links are printed in full, so copy them from there. |
| `SPARROW_SMS_TOKEN` | The OTP is logged to the API console (`OTP for 98… is 123456`). |
| `GOOGLE_CLIENT_ID` / `_SECRET` | The strategy is not registered and `/auth/google` returns a 503 explaining what to set. |
| `AWS_*` / `S3_BUCKET_NAME` | Avatar presigning returns a 503 explaining what to set. |

Set the real values in `.env` to switch any of them over — no code changes.

### Endpoints

```
POST   /auth/register              POST   /auth/forgot-password
POST   /auth/login                 POST   /auth/reset-password
POST   /auth/login/phone           POST   /auth/verify-email
POST   /auth/verify-otp            POST   /auth/resend-verification
POST   /auth/refresh               GET    /auth/google
POST   /auth/logout                GET    /auth/google/callback
GET    /auth/me

GET    /users/profile              GET    /users/addresses
PATCH  /users/profile              POST   /users/addresses
PATCH  /users/password             PATCH  /users/addresses/:id
POST   /users/avatar               PATCH  /users/addresses/:id/default
                                   DELETE /users/addresses/:id
```

Addresses are validated twice: Zod checks the district and province are each real, then the
service checks they actually belong together, so "Kathmandu, Karnali" is rejected. Deletes are
soft, and removing a default promotes the next address automatically.

---

## Catalog

### Endpoints

```
GET    /categories                    tree, with product counts rolled up
GET    /categories/:slug
POST   /categories                    admin
PATCH  /categories/:id                admin
DELETE /categories/:id                admin

GET    /products                      page, limit, sort, category, minPrice,
                                      maxPrice, brand, inStock, search + facets
GET    /products/:slug                variants, images, review summary, related
GET    /search?q=                     faceted, Meilisearch or Postgres

POST   /admin/products                create with images and variants
PATCH  /admin/products/:id
DELETE /admin/products/:id            soft delete
POST   /admin/products/:id/restore
POST   /admin/products/reindex

POST   /admin/products/:id/images/upload-url    presigned S3 POST
POST   /admin/products/:id/images               attach + derive blurhash
PATCH  /admin/products/:id/images/reorder
PATCH  /admin/products/images/:id/primary
DELETE /admin/products/images/:id

GET    /admin/products/:id/variants
POST   /admin/products/:id/variants
POST   /admin/products/:id/variants/matrix      cartesian option builder
PATCH  /admin/products/variants/:id
PATCH  /admin/products/variants/:id/stock       relative, transactional
DELETE /admin/products/variants/:id

POST   /admin/products/bulk-import/preview      validate without writing
POST   /admin/products/bulk-import
GET    /admin/products/bulk-import/template
```

### Search: two engines, one contract

Meilisearch is primary — typo tolerance is the reason it is there. **D3 requires a
PostgreSQL fallback**, and that is a real code path, not a stub: it runs whenever
`MEILI_HOST` is unset or unreachable, and every response carries an `engine` field so the
UI can tell shoppers when typo tolerance is unavailable.

Meilisearch returns ids only; the rows come from Postgres afterwards, so `/search` and
`/products` return the identical shape and the storefront reuses one card component.

> The official Meilisearch SDK is ESM-only from v0.60, which the CommonJS Nest build cannot
> `require`. Rather than pin an old SDK or fight the transpiler, `search/meilisearch.client.ts`
> calls the documented REST API over `fetch` — seven endpoints, no dependency.

### Decisions worth knowing

- **Filtering a parent includes its descendants.** Selecting "Electronics" matches Phones and
  Smartphones too, via `collectDescendantIds`.
- **Brand facets ignore the brand filter.** Otherwise picking a brand collapses the brand list
  to that one option and there is no way back.
- **Ratings are one grouped query per page**, not N per-product aggregates.
- **Products soft-delete**; variants that appear in orders deactivate rather than delete, so
  `order_items` never dangles (D2).
- **Stock adjustments are relative and transactional** — two concurrent edits cannot both read
  the same starting value.
- **Blurhash is derived server-side** on image attach (A1.1 blur-up placeholders), and a fetch
  failure degrades the placeholder rather than rejecting the image.
- **Bulk import validates everything before writing**, reports failures by CSV line number, and
  matches on SKU so re-uploading a corrected file updates instead of duplicating.

### Seeding

```bash
pnpm db:seed                 # settings + demo catalog
SEED_MINIMAL=1 pnpm db:seed  # settings only, for a production-shaped deploy
```

The demo catalog is 18 categories three levels deep and 50 products with variants, images and
randomised stock. The randomness is seeded, so re-running produces the identical catalog —
shuffling data on every run makes screenshots and tests useless. Re-running is safe; everything
upserts on a natural key.

After seeding, build the search index:

```bash
curl -X POST localhost:4000/api/v1/admin/products/reindex   # needs an admin token
```

---

## Design system

Tokens live in `packages/ui/tokens.css` and are mapped onto shadcn's CSS variables, so every
component inherits the brand without per-component overrides.

| Token | Value | Used for |
| --- | --- | --- |
| `--bz-primary` | `#6C3CE1` | Buttons, links, active states, CTAs |
| `--bz-secondary` | `#FF6B35` | Sale badges, urgency, accents |
| `--bz-success` | `#00C48C` | In stock, verified, success |
| `--bz-error` | `#FF4757` | Errors, out of stock, destructive |
| `--bz-warning` | `#F59E0B` | Low stock, flash sale, rating stars |
| Backgrounds | `#FAFBFC` / `#0B0E1A` | Light / dark |
| Surfaces | `#FFFFFF` / `#161B2E` | Cards, light / dark |
| Radii | `8 / 12 / 16 / 9999px` | Inputs / cards / modals / pills |

**Type.** Plus Jakarta Sans (display), Inter (body), JetBrains Mono (data — prices, SKUs,
tracking numbers). All three load through `next/font/google` with `display: swap`.

**Dark mode is the default**, with a one-click light toggle. The toggle swaps icons via CSS
rather than mount state, so there is no hydration flash.

**Motion.** Framer Motion presets in `packages/ui/src/motion.ts` and CSS keyframes in
`packages/ui/animations.css` transcribe the H2 catalog exactly — page load fades up 20px over
400ms on `cubic-bezier(0.22, 1, 0.36, 1)`, product cards stagger 50ms apart, skeletons shimmer
on a 1.5s linear loop. Every animation is disabled under `prefers-reduced-motion`.

**Breakpoints** follow H3: single column under 480px, 2 columns at 640px, 3 at 1024px, 4 at
1280px, centred at 1440px beyond 1536px.

---

## Security model

The blueprint evaluates every decision against the CIA triad. What Phase 1 puts in place:

**Confidentiality** — helmet security headers on every API response; CORS locked to the
frontend origin with credentials enabled for the HttpOnly refresh cookie; secrets validated at
boot and never given working defaults; `.env` git-ignored with `.env.example` as the template.

**Integrity** — a global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` strips
unknown keys so clients cannot smuggle fields into a DTO; Zod schemas shared between form and
endpoint; Prisma-only data access, so parameterisation is not optional; immutable order
snapshots at the schema level.

**Availability** — `ThrottlerModule` at 100 requests/minute (auth endpoints tighten to 20 in
Phase 2); the API boots and serves `/health` in degraded mode when the database is unreachable
rather than crash-looping; graceful shutdown hooks so Prisma drains its pool during rolling
deploys.

Landing in later phases: Argon2id hashing and JWT rotation (Phase 2), webhook HMAC verification
and idempotency keys (Phase 5), pessimistic stock locking at checkout (Phase 5), admin audit
logging (Phase 8), CSP and dependency scanning (Phase 12).

---

## Payments

| Gateway | Region | Method | Fee |
| --- | --- | --- | --- |
| eSewa | Nepal | REST + web redirect, HMAC-SHA256 signed | 1.5–2% |
| Khalti | Nepal | Web SDK v2 + REST lookup | 1.5–2.5% |
| ConnectIPS | Nepal | NCHL API redirect | NPR 10–25 flat |
| Fonepay | Nepal | QR + merchant API | 1–1.5% |
| IME Pay | Nepal | REST + redirect | 1.5% |
| Cash on delivery | Nepal | Marked paid on delivery | 0% |
| Stripe | Global | Payment Intents | 2.9% + 30¢ |
| PayPal | Global | Smart Buttons | 2.9% + 30¢ |

Every flow follows the same rule: **the client never decides whether a payment succeeded.**
The server computes the total, initialises with the gateway, verifies the webhook signature,
then independently confirms via the gateway's verification API before confirming the order.

---

## Orders

### Endpoints

```
GET    /orders                        page, limit, status, from, to, search,
                                      paymentMethod - the shopper's own history
GET    /orders/:id                    items, payment, refunds, status timeline,
                                      tracking, delivery estimate
POST   /orders/:id/cancel             while PENDING, CONFIRMED or PROCESSING
GET    /orders/:id/invoice            VAT invoice PDF, served inline

GET    /admin/orders                  every order, same filters + customer search
GET    /admin/orders/export           the current filter as CSV
GET    /admin/orders/:id
PATCH  /admin/orders/:id/status       { status, note } - guarded by the transition map
PATCH  /admin/orders/bulk-status      one status across a selection, per-row results
POST   /admin/orders/:id/shipping     { trackingNumber, carrier } - notifies on save
POST   /admin/orders/:id/refund       { amount, reason, restock } - via the gateway
```

### The status flow

`ORDER_STATUS_TRANSITIONS` in `@bazaar/shared` is the single source of truth for what may
follow what, and both ends read it: the server refuses an illegal move, and the admin dialog
only offers the moves that are legal, so an operator is never shown a button that will fail.

Two statuses are deliberately not reachable by setting them. **CANCELLED** routes through the
same path as a shopper's own cancellation — stock returned, refund raised — because who
pressed the button should not change whether the customer gets their money back. **REFUNDED**
is refused outright: it is a consequence of money moving, and the money moves on the refund
endpoint. Setting the label without moving the cash would leave the ledger lying.

### What a status change sets off

`OrderEventsService` owns every consequence, and it is called *after* the write commits, never
inside the transaction. An order that is SHIPPED is shipped whether or not Resend answered, so
every notification swallows and logs its own errors rather than failing the transition.

| Transition | What happens |
| --- | --- |
| any | broadcast into the order's Socket.IO room |
| SHIPPED, with a tracking number | shipping email + SMS carrying the tracking link |
| SHIPPED, no number yet | "on its way" email; the tracking mail waits for the number |
| DELIVERED | delivery SMS, and a review request queued for 7 days out |
| refund | refund email + SMS with the amount; the status mail is suppressed |

The review request re-checks every precondition when it runs rather than trusting them from
when it was queued — a week is long enough for the order to have been refunded or returned,
and asking those people for a review would be the worst mail the shop sends. Its job id is
derived from the order id, so an order that reaches DELIVERED twice still asks once.

### Real-time

One Socket.IO room per **order**, not per user: a guest order has no user behind it, and its
uuid is already the only thing guarding it. Joining is authorised exactly as reading is — a
guest order admits anyone holding the id, a customer's order admits that customer and staff,
nobody else — and the check runs per room on `subscribe`, so one socket cannot ride a valid
subscription into a second order it may not see.

The client re-sends its subscribe on every `connect` rather than only on mount: a socket that
drops and comes back has forgotten its rooms, and a shopper watching a page through a tunnel
should not silently stop receiving updates. The token is read at connect time because it
rotates every 15 minutes; an expired one degrades the socket to guest access instead of
dropping it mid-page.

### Decisions worth knowing

- **The order list expands in place.** The commonest question about an old order is "what was
  in it", answerable from lines already paid for on that request. The detail page is for the
  timeline and the tracking link.
- **`to` is pushed to the end of its day.** "1 Sep to 8 Sep" means both days inclusive; a naive
  `lte` on a midnight timestamp silently drops everything bought on the 8th, which reads to a
  shopper as lost orders rather than as an off-by-one.
- **Refund amounts are computed from the payment row**, clamped to captured-minus-already-
  returned, and never read from the request. A partial refund leaves a DELIVERED order
  delivered, because it is; only a full one flips the status.
- **The CSV export carries the current filter** and is written with a UTF-8 BOM, without which
  Excel renders a Nepali customer name as mojibake. Fields beginning `=`, `+`, `-` or `@` are
  prefixed with a quote so a spreadsheet cannot execute them.
- **Bulk updates run one transaction per order.** A hundred-row selection holds rows at
  different statuses; one that cannot legally move must not roll back the ninety-nine that can,
  so failures come back with reasons attached.

---

## Mobile and performance

Phase 11. Three concerns that share one measurement: what a shopper on a mid-range phone on
a 4G connection actually experiences.

### Mobile-specific surfaces

Below `lg` the storefront is a different application, not a narrower one.

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Primary navigation | Navbar + mega menu | [Bottom navigation bar](apps/web/src/components/layout/bottom-nav.tsx) |
| Cart | Slide-out drawer | [Full page](apps/web/src/app/(shop)/cart/cart-view.tsx), swipe an item left to remove |
| Product gallery | Hover zoom, thumbnail strip | Swipe between images, dots below |
| Quick look at a product | Hover overlay | [Long-press → bottom sheet](apps/web/src/components/shop/quick-view-sheet.tsx) |
| Search | Overlay over the page | Full-screen takeover, input focused on open |
| Refresh a listing | Reload | [Pull down](apps/web/src/components/shop/pull-to-refresh.tsx) |
| Browse departments | Mega menu | [`/categories`](apps/web/src/app/(shop)/categories/page.tsx) |

The switch is by **input device**, not width: `(pointer: coarse)` and `(hover: hover)`
rather than a breakpoint. A 1024px tablet needs 44px targets and a 700px browser window on
a laptop does not, and only the pointer query knows the difference.

Anything expressible in CSS is expressed in CSS. `useIsMobile()` returns `false` on the
server, so a JS-gated element is absent from the first paint and appears on hydration — a
layout shift, and at the bottom of the viewport the worst kind. It is used only where the
*behaviour* differs (open the drawer vs. navigate to `/cart`), never to hide markup.

**Touch targets** are enforced once, in [`globals.css`](apps/web/src/app/globals.css),
rather than at ~200 call sites: under `(pointer: coarse)` every button, menu item, select
trigger and tab gets `min-height: 44px`, and icon buttons get the width too. Checkboxes and
switches keep their size and grow an invisible 44px hit area instead — a 44px checkbox is a
different control.

**Long-press** ([`use-long-press.ts`](apps/web/src/lib/hooks/use-long-press.ts)) abandons
the gesture once the finger travels 10px, because a product grid is a vertical scroller
first and a sheet that opens because someone paused mid-flick is a bug. It ignores mouse and
pen pointers outright. **Gallery swipes** use `dragDirectionLock`: without it a
mostly-vertical drag starting inside the frame is captured by the carousel and the page
stops scrolling.

### Performance

`/products`, `/products/[slug]` and `/categories` render on the server *with data* — 48
product cards in the HTML rather than a skeleton — through a two-layer cache:

| Layer | TTL | Invalidated by |
| --- | --- | --- |
| Next data cache (`next: { revalidate }`) | 300s listings, 3600s category tree | Time |
| API cache ([`CacheService`](apps/api/src/common/redis/cache.service.ts)) | Same | Any catalog write |

Invalidation is by **generation counter**, not by deleting keys. An admin editing one
product changes its price on every listing page that contains it, in every sort order, under
every filter combination — a set nobody can enumerate. Incrementing one integer that forms
part of every key orphans the whole namespace at once and lets the entries' own TTLs collect
them; `SCAN`-and-delete over a namespace is O(keyspace) and blocks proportionally.

Every write path invalidates: product create/update/archive/restore and bulk actions, and
also **variant and image writes**, which change the price, the stock and the photo a cached
listing row renders without touching the product row. Product writes drop the *category*
namespace too, because the tree carries a product count per category. Measured locally, a
listing goes from 54ms to 5ms once warm.

Client-side:

- **Images** — AVIF then WebP, `sizes` matching each grid's actual tracks, and a blur-up
  placeholder decoded from the stored blurhash. The first row of a listing is
  `loading="eager"` + `fetchPriority="high"` rather than `preload`: the grid is 1–4 columns
  depending on the viewport, so which card holds the LCP element is not knowable at render
  time, and Next's guidance is to avoid `preload` in exactly that case. The product gallery,
  which has one candidate at every width, does use `preload`. (`priority` is the Next 15
  spelling and is deprecated in 16.)
- **Code splitting** — the chat widget mounts on browser idle or first interaction; Recharts,
  Leaflet and TipTap are `next/dynamic` with matching-height skeletons.
- **Prefetching** — [`PrefetchLink`](apps/web/src/components/shop/prefetch-link.tsx) keeps
  Next's viewport prefetch on a coarse pointer and switches to hover/focus on a fine one. A
  1440px listing has sixteen cards in view and the shopper will open one of them.
- **Streaming** — `loading.tsx` per route, laid out at the size of the real thing.
- **Immutable caching** — a year on `/_next/static`, in production only; `next dev` reuses
  those URLs across rebuilds and an immutable header there pins the first chunk a browser saw.

### The JavaScript budget — missed, and why

The blueprint's J1 budget is **150KB gzipped of first-load JS**. Measured against the built
app with `next start`, excluding the `noModule` polyfill bundle that no supported browser
downloads:

| Route | Before Phase 11 | After | Δ |
| --- | --- | --- | --- |
| `/` | 346 KB | 341 KB | −5 |
| `/products` | 338 KB | 319 KB | −19 |
| `/products/[slug]` | 339 KB | 320 KB | −19 |
| `/cart` | 300 KB | 281 KB | −19 |
| `/categories` | 299 KB | 280 KB | −19 |

**This misses the budget and cannot meet it as the application is built.** Composition of
the 319KB on `/products`:

| | gzip |
| --- | --- |
| React + react-dom | 70 KB |
| Next App Router runtime | 73 KB |
| **Framework subtotal** | **143 KB** |
| Radix primitives (dialog, select, sheet, dropdown, tabs, tooltip) | 104 KB |
| framer-motion | 44 KB |
| sonner, lucide, TanStack Query, zustand | 28 KB |
| Application code | 11 KB |

The framework alone is 143KB. 150KB would leave 7KB for the entire design system and every
line of product code — so the target is unreachable without replacing Radix, framer-motion,
or both, which would undo the Phase 9 design system rather than optimise it. The number is
recorded here rather than quietly restated as met.

What Phase 11 did recover, ~19KB on every storefront route:

- `@bazaar/shared` and `@bazaar/ui` are marked `sideEffects: false`.
- `@bazaar/shared` builds as four tsup entries with subpath exports, so the barrel is a set
  of re-exports across separate chunks instead of one file. Storefront modules that need a
  constant import `@bazaar/shared/constants` or `/enums` directly.
- `RECOMMENDATION_REASON_LABELS` moved from `schemas/ai.ts` to `constants.ts`. It is a list
  of five strings and a label map, and living beside the schemas meant a product card
  importing it pulled all of Zod onto the page.

Zod is now absent from every storefront route except `/`, where the newsletter form uses it
directly and legitimately.

The remaining lever is framer-motion. `LazyMotion` + `m` would save ~25KB, but the
`domAnimation` feature bundle excludes layout animations, which the bottom-navigation
indicator and the cart drawer both use; `domMax` saves ~6KB for the same 129-call-site
refactor. Not worth it, and it would not reach 150KB anyway. Revisit if the animation system
is ever reworked.

`pnpm --filter @bazaar/web analyze` opens the treemaps.

### Accessibility

- **Skip link** first in the tab order, on all three shells (`#main` on each `<main>`).
- **Focus management** — the quick-view sheet and the cart drawer are Radix dialogs: focus
  moves in on open, returns to the trigger on close, Escape dismisses, the rest of the page
  goes inert.
- **A keyboard equivalent for every gesture** — the gallery's swipe is also ArrowLeft/Right,
  the long-press quick view is also the product link, pull-to-refresh is also a reload.
- **Reduced motion** — a global CSS rule collapses durations, and every animation component
  checks `useReducedMotion()`; parallax and confetti do not run at all.
- **Contrast (WCAG AA)** — the four status hues are designed as *fills*. As text on a light
  page `#00C48C` is 2.26:1, `#F59E0B` is 2.15:1, `#FF6B35` is 2.84:1 and `#FF4757` is
  3.34:1 — all under 4.5:1, across 57 call sites. Each now has a darkened partner used only
  for text and icons — `text-ok`, `text-caution`, `text-danger`, `text-deal` — clearing
  4.8:1 to 5.5:1 on white while the fills keep the brand hue. Dark mode already passed at
  7:1 or better, so the tokens there only ease off the saturation. Rating stars are filled
  with the text token too: a star is a graphic that carries meaning, and WCAG 1.4.11 asks
  3:1 of it.

### Measurement

- **Lab** — [Lighthouse CI](apps/web/lighthouserc.json) on every push, mobile emulation,
  three runs. Performance, accessibility and SEO below 0.90 fail the build, as do LCP over
  2500ms, CLS over 0.05 and TBT over 300ms. `color-contrast` and `tap-targets` are asserted
  individually so a regression in either cannot be averaged away by forty passing audits.
  [LIGHTHOUSE.md](apps/web/LIGHTHOUSE.md) records what is disabled and why.
- **Field** — [`WebVitalsProvider`](apps/web/src/components/providers/web-vitals-provider.tsx)
  reports LCP, CLS, INP, FCP and TTFB to `POST /analytics/vitals`, one row per metric in
  `web_vitals`. `sendBeacon`, not `fetch`: CLS and INP are only final at page hide, and a
  fetch started during `visibilitychange` is cancelled along with the tab. Paths are
  normalised to route patterns so a p75 is not sharded across every slug in the catalogue,
  and the callback identity is held stable — Next replays every metric collected so far into
  any callback it has not seen before, so an unstable one double-counts the whole page load.

### Blurhash and the seed

`ProductImagesService` derives a blurhash for every image uploaded through the admin panel,
but the demo catalogue stores picsum URLs without fetching a byte — which is what keeps
seeding fast and possible offline, and also means the placeholder silently does nothing on a
freshly seeded database. `pnpm db:blurhash` backfills them. It is resumable, skips rows that
already have a hash, and leaves an unfetchable image alone rather than writing null.

---

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | **Foundation** — monorepo, configs, shared types, Prisma schema, design system | ✅ Complete |
| 2 | **Authentication** — email/password, Google OAuth, phone OTP, JWT + refresh, guards, profile & address book | ✅ Complete |
| 3 | **Catalog** — categories, products, variants, images, Meilisearch sync, listing and detail pages | ✅ Complete |
| 4 | **Cart & wishlist** — server-side cart, guest merge, slide-out drawer, price-drop alerts | ✅ Complete |
| 5 | **Checkout & payments** — multi-step checkout, all gateways, webhooks, stock reservation | ✅ Complete |
| 6 | **Orders** — history, tracking timeline, admin status flow, invoices, refunds | ✅ Complete |
| 7 | **Reviews & search** — verified-purchase reviews, moderation, faceted search, autocomplete | ✅ Complete |
| 8 | **Admin dashboard** — revenue and order analytics, product CRUD, customers, settings | ✅ Complete |
| 9 | **Homepage & polish** — hero carousel, bento grid, flash sales, full animation pass, PWA | ✅ Complete |
| 10 | **AI** — description generator, chatbot, recommendations, review summaries | ✅ Complete |
| 11 | **Mobile & performance** — bottom nav, gestures, caching, a11y, Lighthouse CI | ✅ Complete |
| 12 | **Deployment** — Vercel + Railway, CI/CD, monitoring, CSP, launch checklist | ⬜ |

Rules that hold for every phase: TypeScript strict with no `any`; Zod validation on every
input; Prisma for all database access; mobile-first CSS from 375px up; commit at the end of
each phase as `Phase X: [title] complete`.

Phase 11 met every functional and accessibility requirement and **missed the 150KB
first-load JavaScript budget**; the measurement and the reason are in
[Mobile and performance](#mobile-and-performance).

---

## Environment variables

Full list with placeholders in [`.env.example`](.env.example). The ones you cannot skip:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Always | PostgreSQL connection string |
| `JWT_SECRET` | Always | ≥32 characters |
| `JWT_REFRESH_SECRET` | Always | ≥32 characters, different from `JWT_SECRET`. **Also required in `apps/web/.env.local`** — `proxy.ts` verifies the session cookie with it, and the two must match. |
| `REDIS_URL` | Recommended | OTP codes, login throttling, token revocation. Falls back to an in-process store — see [Authentication](#authentication). |
| `MEILI_HOST` / `MEILI_MASTER_KEY` | Phase 3+ | Product search |
| `NEXTAUTH_SECRET` | Phase 2+ | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Phase 2+ | Google OAuth |
| `RESEND_API_KEY` | Phase 2+ | Transactional email |
| `SPARROW_SMS_TOKEN` | Phase 2+ | Nepali OTP |
| `ESEWA_*` / `KHALTI_*` / `STRIPE_*` | Phase 5+ | Payment gateways |
| `AWS_*` / `S3_BUCKET_NAME` | Phase 3+ | Media uploads |
| `ANTHROPIC_API_KEY` | Phase 10+ | Claude features |

`NEXT_PUBLIC_*` variables are exposed to the browser. Never put a secret behind that prefix.

---

## Troubleshooting

**`/health` reports `"database": "down"`**
Expected when Postgres is not running. The API stays up deliberately. Start the database
(`docker compose up -d postgres`) and confirm `DATABASE_URL` matches the credentials in `.env`.

**`P1000: Authentication failed against database server`**
The server is reachable but the role or password is wrong. If you already had Postgres
installed, its credentials will not match the compose defaults — either create the `bazaar`
role (see [Getting started](#getting-started)) or point `DATABASE_URL` at an existing database.

**`EPERM ... query_engine-windows.dll.node` during install (Windows)**
A running `node` process is holding the Prisma engine. Stop `pnpm dev` and reinstall.

**`Nest can't resolve dependencies of the ...Service`**
Something is imported with `import type` that Nest needs at runtime. `emitDecoratorMetadata`
records the erased type as `Object` and dependency injection fails — while the build still
passes. Use a value import for anything injected. `consistent-type-imports` is disabled in the
API's ESLint config for exactly this reason; leave it off.

**Logged in, but `/account` still redirects to `/login`**
`proxy.ts` verifies the cookie with `JWT_REFRESH_SECRET` from `apps/web/.env.local`. If that
does not match the API's value in the root `.env`, every session looks forged. The middleware
fails closed by design.

**`/health` reports `"cache": "memory"`**
Redis is not reachable and the in-process fallback is active. Fine for local work; never ship
it — OTP codes and revoked tokens would not be shared between instances.

**No verification or reset email arrives**
Expected without `RESEND_API_KEY`. The full link is printed in the API console instead — look
for `[email:not-sent]`. The phone OTP is printed the same way when Sparrow is unconfigured.

**Types from `@bazaar/shared` look stale**
It compiles to `dist`. Run `pnpm --filter @bazaar/shared build`, or `pnpm dev`, which rebuilds
dependencies first.

**Port already in use**
Web is on 3000, API on 4000. Change `API_PORT` in `.env`, or the `dev` script in
`apps/web/package.json`.

---

## Infrastructure and cost

| Service | Provider | Monthly |
| --- | --- | --- |
| Frontend | Vercel Pro | $20 |
| Backend | Railway Pro | $20–50 |
| PostgreSQL | Neon / Supabase Pro | $25 |
| Redis | Upstash | $5–15 |
| Meilisearch | Meilisearch Cloud | $30 |
| S3 + CloudFront | AWS | $10–20 |
| Email | Resend Pro | $20 |
| SMS | Sparrow SMS | $15–30 |
| Errors | Sentry Team | $26 |
| Uptime | UptimeRobot Pro | $7 |
| DNS | Cloudflare | $0–20 |
| **Total at launch** | | **$178–258** |

**Scaling path.** Under 1,000 users/month runs on single instances and a shared database. At
1K–10K, add a read replica and a CDN. At 10K–100K, move to auto-scaling servers, a dedicated
database and queue workers. Past 100K, multi-region with dedicated queue workers.

---

## License

UNLICENSED — private project.
