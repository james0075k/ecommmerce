# Bazaar

**A next-generation ecommerce platform for Nepal and the world.**

Bazaar is a full-stack storefront and admin platform built around three things most
platforms in this market get wrong: native Nepali payment rails (eSewa, Khalti, ConnectIPS,
Fonepay, IME Pay), district- and province-aware shipping across all 77 districts, and a
design system built for sharing — scroll animations, micro-interactions, dark mode by
default.

This repository implements the blueprint in `../bazaar-ecommerce-blueprint.pdf` across
12 phases. **Phases 1–3 are complete** — the foundation, the authentication and
user-management system, and the product catalog. Phases 4–12 are outlined in the
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

The page at `localhost:3000` is a **Phase 1 verification page**, not the storefront. It renders
the design tokens, the type stack and the component library, and probes the API and database
live so you can confirm the foundation is sound. Phase 9 replaces it with the real homepage.

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
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:reset` | Drop, recreate, re-migrate and re-seed |
| `pnpm clean` | Remove build artifacts and `node_modules` |

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

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | **Foundation** — monorepo, configs, shared types, Prisma schema, design system | ✅ Complete |
| 2 | **Authentication** — email/password, Google OAuth, phone OTP, JWT + refresh, guards, profile & address book | ✅ Complete |
| 3 | **Catalog** — categories, products, variants, images, Meilisearch sync, listing and detail pages | ✅ Complete |
| 4 | **Cart & wishlist** — server-side cart, guest merge, slide-out drawer, price-drop alerts | ⬜ |
| 5 | **Checkout & payments** — multi-step checkout, all gateways, webhooks, stock reservation | ⬜ |
| 6 | **Orders** — history, tracking timeline, admin status flow, invoices, refunds | ⬜ |
| 7 | **Reviews & search** — verified-purchase reviews, moderation, faceted search, autocomplete | ⬜ |
| 8 | **Admin dashboard** — revenue and order analytics, product CRUD, customers, settings | ⬜ |
| 9 | **Homepage & polish** — hero carousel, bento grid, flash sales, full animation pass | ⬜ |
| 10 | **AI** — description generator, chatbot, recommendations, review summaries | ⬜ |
| 11 | **Mobile & performance** — bottom nav, gestures, PWA, Lighthouse 95+ | ⬜ |
| 12 | **Deployment** — Vercel + Railway, CI/CD, monitoring, CSP, launch checklist | ⬜ |

Rules that hold for every phase: TypeScript strict with no `any`; Zod validation on every
input; Prisma for all database access; mobile-first CSS from 375px up; commit at the end of
each phase as `Phase X: [title] complete`.

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
