# Raw SQL migrations

Two requirements from blueprint **C1.6** cannot be expressed in the Prisma schema
language. They are recorded here rather than silently dropped, and should be applied
as a manual migration in the phase noted against each.

Everything else in C1.6 — the GIN indexes on `products.tags` and `products.attributes`,
the composite B-tree indexes on `orders`, `products`, `product_variants` and `reviews`,
and the unique constraint on `cart_items` — **is** in `schema.prisma` and is created by
`pnpm db:push` / `pnpm db:migrate`.

---

## 1. Full-text search index on products — apply in Phase 3

C1.6: *"Full-text search: tsvector GIN index on products (name || description) for
PostgreSQL-level search fallback."*

This is the D3 availability fallback: if Meilisearch is down, search degrades to
Postgres FTS instead of failing.

```sql
-- Generated column keeps the tsvector in sync with no application code.
ALTER TABLE products
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D')
  ) STORED;

CREATE INDEX products_search_vector_idx ON products USING GIN (search_vector);

-- Typo tolerance for the fallback path (Meilisearch handles this natively).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX products_name_trgm_idx ON products USING GIN (name gin_trgm_ops);
```

Add the column to the Prisma schema as `Unsupported("tsvector")?` so `prisma db pull`
does not try to drop it.

---

## 2. Monthly partitioning of page_views — apply when volume justifies it

C1.6: *"page_views: partitioned by month for fast pruning of old analytics data."*

Not needed at launch (Part L: <1,000 users/month). Apply at the **Growth** milestone,
before the table reaches tens of millions of rows. Partitioning requires the partition
key in the primary key, so this is a table rebuild — do it during a maintenance window.

```sql
BEGIN;

ALTER TABLE page_views RENAME TO page_views_old;

CREATE TABLE page_views (
  id          uuid         NOT NULL DEFAULT gen_random_uuid(),
  session_id  varchar(120) NOT NULL,
  user_id     uuid,
  page_path   varchar(500) NOT NULL,
  referrer    varchar(500),
  user_agent  varchar(500),
  country     varchar(60),
  city        varchar(80),
  duration_ms integer,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX ON page_views (created_at);
CREATE INDEX ON page_views (session_id);
CREATE INDEX ON page_views (page_path, created_at);

-- One partition per month.
CREATE TABLE page_views_2027_01 PARTITION OF page_views
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

INSERT INTO page_views SELECT * FROM page_views_old;
DROP TABLE page_views_old;

COMMIT;
```

Automate partition creation with `pg_partman`, or a monthly `pg_cron` job. Pruning old
analytics then becomes `DROP TABLE page_views_2027_01` instead of a slow `DELETE`.
