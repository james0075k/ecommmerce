-- Blueprint C1.6: the PostgreSQL full-text fallback for product search.
--
-- Prisma cannot express a GENERATED ALWAYS column, so `search_vector` arrives
-- from the init migration as a plain, permanently-NULL `tsvector`. This
-- migration replaces it with the real thing. The column stays
-- `Unsupported("tsvector")? @default(dbgenerated())` in schema.prisma, which is
-- Prisma's way of saying "the database owns this one" - do not try to manage
-- its definition from the schema file.
--
-- Why it matters: when Meilisearch is unreachable, search falls back to
-- Postgres (D3). Without this index that fallback is an unindexed ILIKE scan of
-- every product, which is survivable at a thousand rows and not at a hundred
-- thousand.

-- Trigram matching gives the fallback path a little typo tolerance of its own.
-- Meilisearch does this natively; Postgres needs the extension.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "products" DROP COLUMN IF EXISTS "search_vector";

-- Weights decide what ranks first: a query matching a product name (A) beats
-- one matching the body copy (D), which is the whole reason for four setweight
-- calls rather than one concatenation.
ALTER TABLE "products"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("brand", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("short_description", '')), 'C') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'D')
  ) STORED;

CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");

CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
