# Deploying Bazaar

Phase 12. Everything needed to take this repository from a laptop to a production
store, and everything needed to fix it at 2am when it breaks.

The shape of it:

```
                    GitHub  ──push to main──▶  Actions
                                                 │
                              build · lint · typecheck · test
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼                                                 ▼
              Vercel (storefront)                              Railway (API)
              Next.js 16 · edge + node                         Docker · min 2 instances
              bom1 (Mumbai)                                    /health/ready gates traffic
                        │                                                 │
                        └──────────────────┬──────────────────────────────┘
                                           ▼
        ┌──────────────┬──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
      Neon          Upstash      Meilisearch      S3 +         Sentry ·
   Postgres 17       Redis          Cloud       CloudFront   PostHog · Grafana
   + read replica   allkeys-lru                assets.…
```

- [1. Before you start](#1-before-you-start)
- [2. Database — Neon](#2-database--neon)
- [3. Redis — Upstash](#3-redis--upstash)
- [4. Search — Meilisearch Cloud](#4-search--meilisearch-cloud)
- [5. Storage — S3 and CloudFront](#5-storage--s3-and-cloudfront)
- [6. Backend — Railway](#6-backend--railway)
- [7. Frontend — Vercel](#7-frontend--vercel)
- [8. DNS and TLS](#8-dns-and-tls)
- [9. CI/CD](#9-cicd)
- [10. Monitoring](#10-monitoring)
- [11. Migrations](#11-migrations)
- [12. Rolling back](#12-rolling-back)
- [13. Backups and restore](#13-backups-and-restore)
- [14. The CSP, and how to make it stricter](#14-the-csp-and-how-to-make-it-stricter)
- [15. Runbook](#15-runbook)

---

## 1. Before you start

You need accounts on Vercel, Railway, Neon, Upstash, Meilisearch Cloud, AWS, Sentry,
PostHog and Cloudflare, plus production credentials from every payment gateway you
intend to accept. Provision them in the order below — each section's output is the
next one's input.

Two environments, `staging` and `production`, everywhere that supports them. Staging
exists so the deploy pipeline has somewhere to fail; it should point at gateway
sandboxes and its own database, never production's.

Read [`docs/LAUNCH.md`](LAUNCH.md) alongside this. That is the checklist; this is
the how.

---

## 2. Database — Neon

**Why Neon:** connection pooling is built in, branches make staging a copy of
production rather than an approximation, and the free tier is enough for staging.
Supabase is the equivalent choice and the instructions differ only in wording.

1. Create a project in the **Singapore** region — closest to both Nepal and the
   `bom1` Vercel region, and the two round trips per request are the dominant
   latency once the app itself is fast.
2. Create two branches: `production` and `staging`.
3. Take the **pooled** connection string for each. It routes through PgBouncer, and
   it is the one the API must use:

   ```
   postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/bazaar?sslmode=require
   ```

   > **Use the pooled URL, not the direct one.** Serverless Postgres charges for
   > connections and every API instance opens a pool of its own. Two Railway
   > instances at Prisma's default of 9 connections each is 18 before a single
   > background worker starts. PgBouncer makes that one number instead of many.

4. Add `?pgbouncer=true&connection_limit=1` to `DATABASE_URL` if you see
   `prepared statement "s0" already exists` — that is PgBouncer in transaction mode
   meeting Prisma's prepared statements, and it is the documented fix.

### Read replica

Create a read-only compute on the `production` branch and put its pooled string in
`DATABASE_REPLICA_URL`. The analytics dashboard's aggregate scans move there
automatically; nothing else does. See `apps/api/src/prisma/prisma-read.ts` for what
is and is not safe to route through it.

Leave it blank and every query goes to the primary. That is correct, just slower —
add the replica when the dashboard starts showing up in slow-query logs, not before.

### Backups

Neon keeps point-in-time restore for 7 days on the Launch plan, which satisfies the
blueprint's "automated daily backups with 7-day retention". Confirm the retention
window in **Settings → Backup & restore**; the free tier is 24 hours and is not
enough. [Test the restore](#13-backups-and-restore) before launch — an untested
backup is a hope, not a backup.

---

## 3. Redis — Upstash

1. Create a database in the region nearest your Railway deployment.
2. **Eviction: `allkeys-lru`.** This is not optional. Bazaar stores OTP codes, the
   refresh-token denylist, rate-limit counters, BullMQ queues and the catalogue
   cache in one Redis. With `noeviction`, a full instance starts rejecting writes
   and sign-in breaks; with `allkeys-lru` the coldest cache entry is dropped
   instead, which is the outcome you want.

   > Everything in Redis here carries a TTL, so LRU eviction only ever removes
   > something that was going to expire. The one thing it can drop early is a
   > queued job — see below.

3. Copy the `rediss://` URL (two esses: TLS) into `REDIS_URL`.
4. **BullMQ needs `maxmemory-policy noeviction` to be strictly correct**, because an
   evicted job is a lost email. Bazaar accepts LRU on a shared instance because the
   jobs are notifications and index syncs, all of which retry or are re-derivable.
   If you add a job whose loss costs money — a payout, a refund — give queues their
   own Redis with `noeviction` and point BullMQ at it.

Redis being unreachable does not stop the API booting: it falls back to an
in-process store, `/health` reports `redis: degraded`, and the smoke tests fail the
deploy. That fallback is per-instance, so a revoked token would still work on
another node. Never let a production deploy through in that state.

---

## 4. Search — Meilisearch Cloud

1. Create a project; copy the host into `MEILI_HOST` and the master key into
   `MEILI_MASTER_KEY`.
2. The API creates the index and applies its settings at boot — searchable
   attributes, filters, facets, typo tolerance and the ranking rules — so there is
   nothing to configure in their dashboard.
3. Build the index once after the first deploy:

   ```bash
   curl -X POST https://api.bazaar.com.np/api/v1/admin/products/reindex \
     -H "Authorization: Bearer <admin access token>"
   ```

   After that it stays current: product create, update and delete each sync, and a
   failed sync logs rather than rolling back the write.

Meilisearch being unreachable is survivable — search degrades to Postgres full-text,
which is what the `products_search_vector_idx` migration exists for. `/health`
reports `search: postgres` when that has happened, and it is worth an alert.

---

## 5. Storage — S3 and CloudFront

1. **Bucket**, in the region nearest your users. Block *all* public access. The
   browser never reads from S3 directly; CloudFront does, and uploads use presigned
   POSTs that the API signs.
2. **CORS**, so the presigned upload can be POSTed from the admin panel:

   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["POST", "PUT"],
       "AllowedOrigins": ["https://bazaar.com.np", "https://staging.bazaar.com.np"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

3. **Lifecycle rule** on `products/drafts/`: expire after 7 days. A product form
   abandoned after the images were chosen leaves objects nothing references.
4. **CloudFront distribution** with the bucket as an Origin Access Control origin —
   OAC, not the legacy OAI. Attach `assets.bazaar.com.np` and an ACM certificate
   **in us-east-1** (CloudFront only reads certificates from that region; this is
   the single most common hour lost in this section).
5. Put the distribution's domain in `CDN_URL` **and** `NEXT_PUBLIC_CDN_URL`. The
   first tells the API where to publish upload URLs; the second admits the origin to
   the storefront's CSP. Set one and not the other and every product image is
   blocked by the browser with no server-side error anywhere.

### Image processing

Uploads go straight from the browser to S3, so the API never sees the bytes until
the image is attached to a product. At that moment it fetches the object once and
does everything at that pass (`apps/api/src/products/product-images.service.ts`):

- computes width, height and the blurhash for the blur-up placeholder,
- resizes anything over 2000px on its longest edge,
- re-encodes to AVIF at quality 62 and writes the derivative back beside the
  original with an `-opt.avif` suffix,
- strips EXIF, which on a phone photo includes GPS coordinates,
- points the product row at the derivative and keeps the original in
  `original_url`.

It skips all of that for files under 200KB, for images hosted somewhere we do not
own, and whenever the derivative comes out larger than the source. Every failure
falls back to storing the original URL — a heavy image is a slow page; no image is a
lost sale.

---

## 6. Backend — Railway

`railway.toml` at the repository root carries the deployment shape. Secrets do not
live there.

1. New project → **Deploy from GitHub repo**. Railway reads `railway.toml` and
   builds `apps/api/Dockerfile` with the repository root as context.
2. Create `staging` and `production` environments.
3. Set the variables from `.env.example` in each. The ones with no safe default:

   | Variable | Note |
   | --- | --- |
   | `DATABASE_URL` | Neon **pooled** string for that environment |
   | `DATABASE_REPLICA_URL` | Optional; the read-only compute |
   | `REDIS_URL` | Upstash, `rediss://` |
   | `JWT_SECRET`, `JWT_REFRESH_SECRET` | ≥32 chars, different from each other, different per environment |
   | `CORS_ORIGIN` | The storefront origin(s), comma-separated |
   | `WEB_PUBLIC_URL` | The storefront's canonical origin |
   | `TRUST_PROXY_HOPS` | `1` behind Railway alone; `2` with a CDN in front |
   | `METRICS_TOKEN` | `openssl rand -hex 32`. **Required** — without it `/metrics` refuses to serve in production |
   | `SENTRY_DSN` | Backend project DSN |
   | `RELEASE_VERSION` | `${{RAILWAY_GIT_COMMIT_SHA}}` |

4. **Health check.** Already in `railway.toml`: `/api/v1/health/ready`, 300s
   timeout. Readiness, not `/health` — the latter answers 200 while degraded by
   design, and would cut traffic over to an instance that cannot reach the database.
5. **Replicas.** `numReplicas = 2` in `railway.toml`. One instance means every
   deploy is downtime, and it also hides a broken Redis: with two, a session written
   on one and read on the other fails loudly.
6. **Autoscaling.** Service → **Settings → Scaling**: target 70% CPU, min 2, max 10.
   Railway does not express the target in `railway.toml`; the intent is recorded in
   a comment there so the two do not drift silently.
7. **Custom domain.** `api.bazaar.com.np`. Railway issues and renews the
   certificate.

### The image

Multi-stage, `node:22-alpine`, running as the unprivileged `node` user under `tini`.
Node 22 rather than the blueprint's 20 because `.nvmrc` and `engines` both say 22,
and `argon2` and `sharp` ship native binaries per ABI — building on one major and
running on another passes CI and segfaults in production.

Build and run it locally exactly as Railway does:

```bash
docker build -f apps/api/Dockerfile -t bazaar-api .   # from the repo ROOT
docker run --env-file .env -p 4000:4000 bazaar-api
```

---

## 7. Frontend — Vercel

1. Import the repository. **Root Directory: the repository root**, not `apps/web` —
   `vercel.json` drives the build with a Turborepo filter and needs the workspace.
2. Vercel detects `vercel.json`. Region is `bom1` (Mumbai).
3. Environment variables, per environment (Production / Preview / Development):

   | Variable | Production example |
   | --- | --- |
   | `NEXT_PUBLIC_API_URL` | `https://api.bazaar.com.np/api/v1` |
   | `NEXT_PUBLIC_SITE_URL` | `https://bazaar.com.np` |
   | `NEXT_PUBLIC_CDN_URL` | `https://assets.bazaar.com.np` |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
   | `NEXT_PUBLIC_MEILI_HOST` | Meilisearch Cloud host |
   | `NEXT_PUBLIC_SENTRY_DSN` | Frontend project DSN |
   | `NEXT_PUBLIC_POSTHOG_KEY` | Leave blank to ship no third-party analytics — the cookie banner then does not appear either |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
   | `JWT_REFRESH_SECRET` | **Must match the API's exactly.** `proxy.ts` verifies the session cookie with it and fails closed, so a mismatch logs everyone out with no error anywhere |
   | `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Source-map upload at build time |

4. **Preview deployments** are on by default for every pull request. They serve the
   whole catalogue on a `vercel.app` domain, so `app/robots.ts` refuses every
   crawler when `VERCEL_ENV === 'preview'` — otherwise previews compete with
   production for the same queries.
5. **Runtimes.** Everything runs on Node except `proxy.ts`, which Next runs on the
   edge. That split is deliberate and needs no configuration: the middleware does
   one JWT verification per protected route and belongs as close to the visitor as
   possible, while the pages fetch from the API and gain nothing from the edge.
   Nothing here is worth forcing onto `export const runtime = 'edge'` — the Node
   runtime is where `sharp` and the full Sentry SDK work.

---

## 8. DNS and TLS

Cloudflare, DNS-only (grey cloud) for the API — proxying it puts a second CDN in
front of Railway's own edge and breaks the `X-Forwarded-For` count that
`TRUST_PROXY_HOPS` is set from.

| Record | Type | Target |
| --- | --- | --- |
| `bazaar.com.np` | A / ALIAS | Vercel |
| `www` | CNAME | `cname.vercel-dns.com` |
| `api` | CNAME | Railway's generated domain |
| `assets` | CNAME | CloudFront distribution |

All three platforms issue and renew certificates automatically. HSTS is sent by both
the API (`apps/api/src/config/security-headers.ts`) and the storefront
(`apps/web/next.config.ts`): two years, `includeSubDomains`, `preload` — **in
production only**, because a `localhost` HSTS entry is cached by the browser for the
full max-age and then poisons every other http://localhost project on the machine.

Submit to the preload list at <https://hstspreload.org> only once every subdomain is
on HTTPS. Removal takes months.

---

## 9. CI/CD

Three workflows.

**`.github/workflows/ci.yml`** — every pull request and every push to main:
lint → typecheck → unit tests → build, a Docker build that also boots the image and
waits for `/health/live` with no database attached, and `pnpm audit --audit-level
high --prod`.

**`.github/workflows/deploy.yml`** — pushes to main:

```
build → deploy staging → smoke staging → promote production → smoke production
```

Each gate blocks the next. `promote-production` targets the `production` GitHub
Environment, so a required reviewer can be added there without editing the workflow.
`workflow_dispatch` with `skip_staging` exists for hotfixes.

**`.github/workflows/lighthouse.yml`** — Phase 11's performance and accessibility
budgets, enforced rather than monitored.

### Repository configuration

Secrets: `RAILWAY_TOKEN_STAGING`, `RAILWAY_TOKEN_PRODUCTION`, `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SENTRY_ORG`, `SENTRY_PROJECT`,
`SENTRY_AUTH_TOKEN`.

Variables: `STAGING_WEB_URL`, `STAGING_API_URL`, `PRODUCTION_WEB_URL`,
`PRODUCTION_API_URL`, `RAILWAY_API_SERVICE_STAGING`,
`RAILWAY_API_SERVICE_PRODUCTION`.

### Smoke tests

`scripts/smoke-test.mjs`, no dependencies, runs on a bare Node runner:

```bash
pnpm smoke --web https://bazaar.com.np --api https://api.bazaar.com.np/api/v1
```

It checks that the API reaches its database and a real Redis, that the catalogue is
not empty, that protected routes still answer 401, that `/metrics` is not publicly
readable, that the storefront server-renders and sends its security headers, that
the CSP still permits eSewa's form POST, and that an unknown URL returns 404 rather
than 200. It is a check that the deployment is wired up, not a test suite.

---

## 10. Monitoring

### Sentry

Two projects, `bazaar-api` (Node) and `bazaar-web` (Next.js).

- Backend: initialised in `apps/api/src/observability/instrument.ts`, imported first
  in `main.ts`. Only 5xx responses are reported — a 404 or a rejected DTO is the API
  working correctly, and an issue feed full of them is one nobody reads.
- Frontend: `instrumentation-client.ts`, `sentry.server.config.ts`,
  `sentry.edge.config.ts`. Session replay is deliberately **not** enabled: the
  bundle is ~50KB gzipped and would eat a third of Phase 11's first-load budget.
- `tunnelRoute: '/monitoring'` proxies ingest through the app's own origin, so an ad
  blocker does not silently drop every report.
- `sendDefaultPii: false` everywhere, and cookies and `Authorization` headers are
  stripped in `beforeSend`.

Alert on: a new issue in production, error rate > 1% over 5 minutes, p95 transaction
duration > 2s.

### UptimeRobot

| Monitor | URL | Interval |
| --- | --- | --- |
| API health | `https://api.bazaar.com.np/api/v1/health` | 60s |
| Storefront | `https://bazaar.com.np` | 60s |

Use `/health`, not `/health/ready`, for uptime: it answers 200 while degraded and
returns a body you can keyword-match. Add a keyword monitor on `"db":"connected"` —
a plain 200 check would stay green through a database outage, which is the outage
you most want to hear about.

`/health` and its two probes skip the rate limiter. A 60-second monitor plus the
platform's own probe on a shared egress IP would otherwise exhaust a bucket and
start reporting the site as down because it asked too often whether it was up.

### PostHog

Only loads after a visitor accepts analytics cookies, and `posthog-js` is not
downloaded at all until then. Session replay masks every input, so a checkout
recording contains no addresses. Leave `NEXT_PUBLIC_POSTHOG_KEY` blank to ship
without it — the cookie banner then does not appear, because there is nothing to
consent to.

### Prometheus and Grafana

`GET /api/v1/metrics`, behind `METRICS_TOKEN`:

```yaml
scrape_configs:
  - job_name: bazaar-api
    scrape_interval: 30s
    metrics_path: /api/v1/metrics
    scheme: https
    static_configs:
      - targets: ['api.bazaar.com.np']
    authorization:
      credentials: '<METRICS_TOKEN>'
```

Exposed:

| Metric | What it tells you |
| --- | --- |
| `bazaar_http_request_duration_seconds` | Latency histogram by method, matched route and status |
| `bazaar_http_requests_total` | Throughput and error rate |
| `bazaar_http_requests_in_flight` | A rising floor means saturation before latency shows it |
| `bazaar_db_connections{state}` / `_max` | The ratio is the number that matters |
| `bazaar_dependency_up{dependency}` | `redis=0` means the in-process fallback is active |
| `bazaar_process_*`, `bazaar_nodejs_*` | CPU, RSS, heap, event loop lag, GC |

Event loop lag is the one worth a panel of its own: it is what distinguishes a slow
database from a blocked process, and every other metric looks the same in both cases.

The `route` label is the *pattern* Nest matched (`/products/:slug`), never the URL.
With the URL, one crawler walking the catalogue creates fifty thousand time series.

---

## 11. Migrations

The repository has real migration files as of Phase 12:

```
prisma/migrations/
  20260904090000_init/                        the whole schema
  20260904090100_products_fulltext_search/    the tsvector column Prisma cannot express
  20260904090200_product_image_original_url/  keeps the pre-compression original
```

`prisma migrate deploy` runs in `apps/api/docker-entrypoint.sh` before the server
starts. Never `migrate dev` and never `db push` in production — both will drop a
column to make the database match the schema.

At two replicas both containers run it on boot. That is safe: `migrate deploy` takes
a Postgres advisory lock, so the second waits and then finds nothing to do. Once a
migration takes minutes, move it to a release step instead — set
`RUN_MIGRATIONS=false` and uncomment `preDeployCommand` in `railway.toml`. Every
instance waiting on the lock is an instance not serving traffic.

### Baselining an existing database

Phases 1–11 used `db push`, so a database created before Phase 12 already has the
schema and `migrate deploy` would try to create it again. Mark the migrations as
already applied instead:

```bash
pnpm exec prisma migrate resolve --applied 20260904090000_init
pnpm exec prisma migrate resolve --applied 20260904090100_products_fulltext_search
pnpm exec prisma migrate resolve --applied 20260904090200_product_image_original_url
```

The last two add things `db push` never created — the generated `search_vector`
column and `product_images.original_url` — so on a pre-Phase-12 database, apply
those two SQL files by hand before resolving them.

### Writing a new one

```bash
pnpm db:migrate --name what_it_does   # generates and applies locally
```

Commit the generated SQL. Review it before you do: Prisma renders a column rename as
drop-then-add, which is a silent data loss on a table with rows in it.

---

## 12. Rolling back

Rollback is manual on purpose. An automatic rollback after migrations have run needs
a down migration that has itself been tested, and an untested automatic rollback is a
second incident on top of the first.

**Storefront** — Vercel → Deployments → the last good one → **Promote to
Production**. Instant; it is a pointer change.

**API** — Railway → Deployments → the last good one → **Redeploy**.

**If the bad release migrated the database**, redeploying the old image points old
code at a new schema. Additive migrations (a new nullable column, a new table) are
safe that way — which is why every migration should be additive. A destructive one
needs the database restored first, and that means data loss between the restore point
and now. This is the reason the launch checklist insists on testing a restore.

---

## 13. Backups and restore

Neon takes continuous backups; retention is the plan's, not a setting you configure
per-database. Confirm 7 days on the Launch plan.

**Test the restore before launch, and once a quarter after:**

1. Neon → the `production` branch → **Restore** → pick a timestamp an hour ago.
2. Restore into a *new* branch. Never over production.
3. Point a local API at the restored branch:
   ```bash
   DATABASE_URL="<restored branch pooled URL>" pnpm --filter @bazaar/api start:prod
   pnpm smoke --api http://localhost:4000/api/v1
   ```
4. Check that recent orders are present and that the row counts look right.
5. Delete the branch.

Write down how long the whole thing took. That number is the recovery time
objective, and it is the only honest answer to "how long would we be down".

---

## 14. The CSP, and how to make it stricter

`apps/web/csp.ts` builds the storefront's policy from the configured origins.
`apps/api/src/config/security-headers.ts` builds the API's, which is
`default-src 'none'` because the API answers with JSON, CSV and PDF and never with a
document.

The storefront's `script-src` includes `'unsafe-inline'`. This is a real weakness and
it is stated in the file rather than hidden: the App Router emits inline bootstrap
and RSC payload scripts on every page, and allowing them without `'unsafe-inline'`
needs a per-request nonce from middleware — which means reading a request header in
every page, which opts every page out of static rendering. Phase 11 spent its budget
on static rendering and a 150KB first load.

So the policy stops an attacker loading a script from a host you do not control, and
does not stop one who can already inject a `<script>` tag into your HTML. React
escaping interpolated values is what actually prevents that; this is the second
layer.

**To upgrade to nonces**, when the trade is worth it:

1. Widen the `proxy.ts` matcher to every page route.
2. Generate a nonce per request there, set it on the response CSP header and on a
   request header.
3. Read it in the root layout with `headers()` and pass it to Next's script tags.
4. Accept that every page becomes dynamically rendered, and re-measure with
   `pnpm --filter @bazaar/web analyze` and the Lighthouse workflow before merging.

**`form-action` is the directive that breaks checkout if you get it wrong.** eSewa
and ConnectIPS take a real form POST, so `'self'` alone means the pay button
silently does nothing. Both sandbox and production hosts for all five Nepali gateways
are listed in `csp.ts`; add a new one there or through
`NEXT_PUBLIC_PAYMENT_FORM_ORIGINS`.

---

## 15. Runbook

**`/health` says `"db": "disconnected"`**
The API is up and cannot reach Postgres. Check Neon's status page, then the
connection count — `bazaar_db_connections` against `bazaar_db_connections_max`. If it
is at the ceiling, you are on the direct connection string rather than the pooled
one, or an instance is not closing its pool.

**`/health` says `"redis": "degraded"`**
Upstash is unreachable and the in-process fallback is serving OTP codes and the token
denylist. That store is per-instance: a revoked token still works on the other node.
Treat it as a security incident, not a performance one.

**Every request is rate-limited**
`TRUST_PROXY_HOPS` is too low, so Express reads Railway's router as the client and
throttles the entire world as one bucket. `1` behind Railway alone, `2` with a CDN in
front.

**Signed in, then immediately signed out**
`JWT_REFRESH_SECRET` differs between the API and Vercel. `proxy.ts` verifies the
cookie with it and fails closed, so every session looks forged. There is no error
message for this anywhere; it just looks like the session expired.

**Product images do not load, no errors in the API log**
`NEXT_PUBLIC_CDN_URL` is unset or does not match `CDN_URL`. The origin is missing
from the CSP's `img-src` and the browser blocks every image. The CSP violation is in
the browser console, nowhere else.

**Checkout's pay button does nothing on one gateway**
That gateway's origin is missing from `form-action`. The browser logs a CSP
violation; the API sees no request at all, because none was made.

**Search results went strange after a Meilisearch upgrade**
Check `/health` for `search: postgres` — you may be on the fallback. If not, the
ranking rules in `search.service.ts` are pinned explicitly for exactly this reason;
compare them against what the index actually reports.

**A deploy is stuck "waiting for health check"**
The container is running and `/health/ready` is not answering 200. Almost always
`DATABASE_URL`. Check the Railway logs for the entrypoint's migration output —
`migrate deploy` failing is the other common cause, and it fails loudly.

**Lighthouse CI fails on a pull request**
Read the first-load JavaScript summary in the job output before the scores. The
budget is 150KB gzipped and Phase 11 documents where it already stands; a regression
is almost always a new client component pulling a library into the shell.
