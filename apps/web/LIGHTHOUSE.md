# Lighthouse CI

The budgets in [`lighthouserc.json`](./lighthouserc.json) are the ones Phase 11
commits to. They run on every push through
[`.github/workflows/lighthouse.yml`](../../.github/workflows/lighthouse.yml) and
fail the build rather than warn.

## What is asserted, and why

| Assertion                  | Threshold | Note                                                                    |
| -------------------------- | --------- | ----------------------------------------------------------------------- |
| `categories:performance`   | ≥ 0.90    | Fails the build.                                                        |
| `categories:accessibility` | ≥ 0.90    | Fails the build.                                                        |
| `categories:seo`           | ≥ 0.90    | Fails the build.                                                        |
| `categories:best-practices`| ≥ 0.90    | Warns. It flags third-party cookies and console noise the app does not own. |
| `largest-contentful-paint` | ≤ 2500ms  | Google's "good" threshold, on Lighthouse's simulated slow 4G.            |
| `cumulative-layout-shift`  | ≤ 0.05    | The J1 budget, which is tighter than Google's 0.1.                       |
| `total-blocking-time`      | ≤ 300ms   | The proxy for INP that a lab run can actually measure.                   |
| `color-contrast`           | error     | Asserted directly as well as through the a11y score, so a regression here cannot be averaged away by 40 passing audits. |
| `tap-targets`              | error     | Mobile-only audit. This is the one that would have caught the 32px buttons Phase 11 fixed. |

Runs use Lighthouse's **default mobile** emulation - a mid-range phone on
throttled 4G - because that is the device the phase was written for. A desktop
preset would score higher and tell you less.

`numberOfRuns: 3` because a single Lighthouse run varies by several points on a
shared CI runner; the median is reported.

### Deliberately disabled

- **`uses-http2`, `is-on-https`, `redirects-http`** - properties of the CDN and
  the load balancer, neither of which exists in front of `next start` on a CI
  runner. Real values come from the production audit in Phase 12.
- **`unused-javascript`** - flags the framework runtime, which is not something
  a route can act on. The number that matters is the first-load JS in
  `next build`, which the workflow prints and the budget below governs.
- **`uses-long-cache-ttl`** - the immutable headers are set in `next.config.ts`
  and served by `next start`, but Lighthouse scores them against the whole
  origin including the HTML, which must not be cached.

## LCP on the product page

The `TEST` line for Phase 11 asks for LCP under 1.5s on 4G. That is measured
against a real device on a real network, not against Lighthouse's simulated
throttling, which deliberately models a worse connection than a typical 4G
link. The lab assertion here is the 2500ms "good" threshold; the 1.5s figure is
tracked in the field through the `web_vitals` table, which is where the p75 that
matters actually lives.

## JavaScript budget

150KB gzipped of first-load JS on the storefront routes. `next build` prints
this per route; `pnpm --filter @bazaar/web analyze` opens the treemap that shows
what moved.

## Running it locally

```bash
pnpm --filter @bazaar/web build
pnpm dlx @lhci/cli autorun --config=apps/web/lighthouserc.json
```

The API must be reachable at `NEXT_PUBLIC_API_URL` or the listing renders its
degraded empty state and the performance number will be flattering and useless.
