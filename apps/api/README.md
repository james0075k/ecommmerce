# @bazaar/api

NestJS backend for Bazaar. Runs on **:4000** under the `/api/v1` prefix.

Setup, scripts and architecture live in the [root README](../../README.md) — run everything
from the repository root so Turborepo builds workspace dependencies first.

## Layout

```
src/
├── main.ts              helmet · compression · CORS · ValidationPipe · /api/v1
├── app.module.ts        ConfigModule · ThrottlerModule · JwtModule · ScheduleModule
├── config/env.ts        Zod environment contract - boot fails on a bad config
├── prisma/              connection lifecycle only, no queries
├── health/              GET /api/v1/health
├── common/              guards · filters · pipes · interceptors · decorators
└── <domain>/            auth, users, products, orders, payments, ... (Phases 2-10)
```

## Conventions

- **Never `import type` for anything Nest injects.** `emitDecoratorMetadata` records an erased
  type as `Object`, so DI fails at runtime while the build still passes.
- All input is validated with Zod schemas from `@bazaar/shared` — the same ones the frontend
  forms use.
- Prisma is the only path to the database. No raw SQL in application code.

## Health check

```bash
curl http://localhost:4000/api/v1/health
```

Returns `status: "ok"` when the database is reachable and `"degraded"` when it is not. The API
stays up either way, by design.
