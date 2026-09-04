#!/usr/bin/env node
/**
 * Post-deploy smoke tests (Phase 12.7).
 *
 *   node scripts/smoke-test.mjs --web https://staging.bazaar.com.np \
 *                               --api https://api-staging.bazaar.com.np/api/v1
 *
 * Run against staging after a deploy and against production after a promote.
 * Exits non-zero on the first failure, which is what stops the pipeline from
 * promoting a broken release.
 *
 * What this is: a check that the deployment is wired up - the API can reach its
 * database, the storefront renders, the security headers survived the CDN, and
 * the SEO routes exist. What it is not: a test suite. Business logic is covered
 * by the unit tests; running assertions about pricing against production would
 * write rows into a real database.
 *
 * No dependencies on purpose. It runs on a bare Node 22 runner before anything
 * is installed, and `fetch` has been global since Node 18.
 */

const args = parseArgs(process.argv.slice(2));

const WEB = trimSlash(args.web ?? process.env.SMOKE_WEB_URL ?? '');
const API = trimSlash(args.api ?? process.env.SMOKE_API_URL ?? '');
/** Generous, because a cold serverless start is not a failure. */
const TIMEOUT_MS = Number(args.timeout ?? 20_000);
/** How long the homepage may take before it counts as a regression, not an outage. */
const HOMEPAGE_BUDGET_MS = Number(args.budget ?? 3_000);

if (!WEB && !API) {
  fail('Nothing to test. Pass --web and/or --api.');
}

/** Collected rather than thrown, so one run reports every problem it found. */
const failures = [];
let checks = 0;

/* -------------------------------------------------------------------------- */
/*  Assertions                                                                */
/* -------------------------------------------------------------------------- */

function check(name, condition, detail = '') {
  checks += 1;

  if (condition) {
    console.log(`  ✓ ${name}`);
    return true;
  }

  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  failures.push(name);
  return false;
}

async function get(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'user-agent': 'bazaar-smoke-test', ...init.headers },
      ...init,
    });

    return { response, ms: Date.now() - startedAt };
  } catch (error) {
    return { response: null, ms: Date.now() - startedAt, error };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/*  API                                                                       */
/* -------------------------------------------------------------------------- */

async function testApi() {
  console.log(`\nAPI  ${API}`);

  const { response, error } = await get(`${API}/health`);
  if (!check('GET /health responds', response !== null, error?.message)) return;
  if (!check('GET /health is 200', response.status === 200, `got ${response.status}`)) return;

  let body;
  try {
    body = await response.json();
  } catch {
    check('GET /health returns JSON', false);
    return;
  }

  // The database is the one dependency whose absence must fail a deploy. Redis
  // on the in-process fallback is reported as `degraded` and checked
  // separately, because it is survivable for minutes and not for a release.
  check('database is connected', body.db === 'connected', `db=${body.db}`);
  check(
    'Redis is connected (not the in-process fallback)',
    body.redis === 'connected',
    `redis=${body.redis}`,
  );
  check('overall status is ok', body.status === 'ok', `status=${body.status}`);
  check('uptime is reported', typeof body.uptime === 'number');

  const ready = await get(`${API}/health/ready`);
  check(
    'GET /health/ready is 200',
    ready.response?.status === 200,
    `got ${ready.response?.status}`,
  );

  const live = await get(`${API}/health/live`);
  check('GET /health/live is 200', live.response?.status === 200);

  // A public read path, to prove the database is not merely reachable but
  // actually holds the catalogue. An empty store is a failed seed or a
  // migration that did not run.
  const products = await get(`${API}/products?limit=1`);
  if (check('GET /products is 200', products.response?.status === 200)) {
    const payload = await products.response.json().catch(() => null);
    check(
      'the catalogue is not empty',
      Array.isArray(payload?.items) && payload.items.length > 0,
      'zero products returned',
    );
  }

  // Authentication is opt-out in this API - a route that forgot @Public() locks
  // down rather than leaking. This proves the guard is actually installed.
  const guarded = await get(`${API}/users/me`);
  check(
    'protected routes reject anonymous callers',
    guarded.response?.status === 401,
    `got ${guarded.response?.status}`,
  );

  // /metrics must not be readable without the token in production.
  const metrics = await get(`${API}/metrics`);
  check(
    '/metrics is not publicly readable',
    metrics.response?.status === 403 || metrics.response?.status === 503,
    `got ${metrics.response?.status} — set METRICS_TOKEN`,
  );

  const headers = response.headers;
  check('API sends HSTS', Boolean(headers.get('strict-transport-security')));
  check('API sends a CSP', Boolean(headers.get('content-security-policy')));
  check(
    'API does not advertise Express',
    !headers.get('x-powered-by'),
    headers.get('x-powered-by') ?? '',
  );
}

/* -------------------------------------------------------------------------- */
/*  Storefront                                                                */
/* -------------------------------------------------------------------------- */

async function testWeb() {
  console.log(`\nWEB  ${WEB}`);

  const { response, ms, error } = await get(WEB);
  if (!check('homepage responds', response !== null, error?.message)) return;
  if (!check('homepage is 200', response.status === 200, `got ${response.status}`)) return;

  check(
    `homepage renders within ${HOMEPAGE_BUDGET_MS}ms`,
    ms < HOMEPAGE_BUDGET_MS,
    `took ${ms}ms`,
  );

  const html = await response.text();
  check('homepage is HTML, not an error shell', html.includes('<html'));
  // Server-rendered content, not a client-side skeleton. If the API were
  // unreachable the page would still be 200 - this is what catches that.
  check('homepage server-renders the store', /Bazaar/i.test(html));

  const headers = response.headers;
  check('storefront sends a CSP', Boolean(headers.get('content-security-policy')));
  check('storefront sends HSTS', Boolean(headers.get('strict-transport-security')));
  check(
    'storefront sends X-Content-Type-Options',
    headers.get('x-content-type-options') === 'nosniff',
  );
  check('storefront sends X-Frame-Options', headers.get('x-frame-options') === 'DENY');
  check(
    'storefront does not advertise Next.js',
    !headers.get('x-powered-by'),
    headers.get('x-powered-by') ?? '',
  );

  const csp = headers.get('content-security-policy') ?? '';
  check("CSP allows eSewa's form POST", csp.includes('esewa.com.np'));
  check('CSP blocks framing', csp.includes("frame-ancestors 'none'"));

  for (const path of ['/products', '/categories', '/privacy', '/terms', '/refunds']) {
    const page = await get(`${WEB}${path}`);
    check(`GET ${path} is 200`, page.response?.status === 200, `got ${page.response?.status}`);
  }

  const robots = await get(`${WEB}/robots.txt`);
  if (check('GET /robots.txt is 200', robots.response?.status === 200)) {
    const text = await robots.response.text();
    check('robots.txt points at the sitemap', text.includes('Sitemap:'));
  }

  const sitemap = await get(`${WEB}/sitemap.xml`);
  if (check('GET /sitemap.xml is 200', sitemap.response?.status === 200)) {
    const xml = await sitemap.response.text();
    check('sitemap lists product URLs', xml.includes('/products/'));
  }

  // A 404 that answers 200 is invisible to monitoring and poison to SEO.
  const missing = await get(`${WEB}/this-page-does-not-exist-${Date.now()}`);
  check(
    'unknown URLs return 404',
    missing.response?.status === 404,
    `got ${missing.response?.status}`,
  );

  const manifest = await get(`${WEB}/manifest.webmanifest`);
  check('PWA manifest is served', manifest.response?.status === 200);
}

/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const next = argv[index + 1];
    const hasValue = next !== undefined && !next.startsWith('--');

    parsed[token.slice(2)] = hasValue ? next : 'true';
    if (hasValue) index += 1;
  }

  return parsed;
}

function trimSlash(value) {
  return value.replace(/\/$/, '');
}

function fail(message) {
  console.error(`smoke-test: ${message}`);
  process.exit(2);
}

const startedAt = Date.now();

if (API) await testApi();
if (WEB) await testWeb();

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
  `\n${checks - failures.length}/${checks} checks passed in ${seconds}s` +
    (failures.length ? `\n\nFailed:\n  - ${failures.join('\n  - ')}` : ''),
);

process.exit(failures.length > 0 ? 1 : 0);
