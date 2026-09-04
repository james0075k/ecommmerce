/**
 * Content Security Policy for the storefront (Phase 12.9).
 *
 * Built here rather than inlined in next.config.ts because the origins are
 * environment-dependent - the API, the CDN, Sentry's ingest host and the
 * payment gateways all differ between local, staging and production, and a
 * policy with the wrong origins in it does not warn, it silently breaks
 * checkout.
 *
 * ── The compromise, stated plainly ─────────────────────────────────────────
 * `script-src` includes `'unsafe-inline'`. The App Router emits inline
 * bootstrap and RSC payload scripts on every page, and the only way to allow
 * them without `'unsafe-inline'` is a per-request nonce - which has to come
 * from middleware, and reading it in a page opts that page out of static
 * rendering. Phase 11 spent its whole budget on static rendering and a 150KB
 * first load; trading that away wholesale would undo it.
 *
 * So this is a policy that stops an attacker loading a script from a host you
 * do not control, and does not stop one who can already inject a <script> tag
 * into your HTML. React escapes interpolated values, which is what actually
 * prevents that; the CSP is the second layer. `docs/DEPLOYMENT.md` has the
 * nonce upgrade path for when the trade is worth revisiting.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Where a shopper's browser is POSTed during checkout. `form-action` is the
 * directive that would otherwise break every Nepali gateway: eSewa and
 * ConnectIPS take a real form POST with their fields in their own order, so
 * `'self'` alone means the pay button does nothing at all.
 *
 * Sandbox and production hosts are both listed. A staging deployment points at
 * the sandbox, and keeping one list means staging exercises the same header
 * production will get.
 */
const PAYMENT_FORM_ORIGINS = [
  // eSewa - rc-epay is the RC sandbox.
  'https://rc-epay.esewa.com.np',
  'https://epay.esewa.com.np',
  // Khalti.
  'https://a.khalti.com',
  'https://pay.khalti.com',
  'https://khalti.com',
  // ConnectIPS (NCHL).
  'https://uat.connectips.com',
  'https://login.connectips.com',
  // Fonepay.
  'https://dev-merchantapi.fonepay.com',
  'https://merchantapi.fonepay.com',
  'https://login.fonepay.com',
  // IME Pay.
  'https://stg.imepay.com.np:7979',
  'https://payment.imepay.com.np',
];

/** Stripe.js and the Payment Element iframe. */
const STRIPE_SCRIPT = 'https://js.stripe.com';
const STRIPE_FRAME = ['https://js.stripe.com', 'https://hooks.stripe.com'];
const STRIPE_API = 'https://api.stripe.com';

/** Basemap tiles for the admin dashboard's order map. */
const MAP_TILES = 'https://*.basemaps.cartocdn.com';

/** Product and category imagery. The seed catalogue uses picsum. */
const IMAGE_HOSTS = [
  'https://*.amazonaws.com',
  'https://*.cloudfront.net',
  'https://picsum.photos',
  'https://fastly.picsum.photos',
];

/** `https://x/y` -> `https://x`. Returns null for anything unparseable. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The API is reached over both HTTP and WebSocket (order tracking, admin
 * notifications). `connect-src` treats the two schemes separately, so a policy
 * that only lists https:// kills realtime with a console error and no other
 * symptom.
 */
function websocketOrigin(origin: string): string | null {
  return origin.startsWith('http') ? origin.replace(/^http/, 'ws') : null;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function buildContentSecurityPolicy(env: NodeJS.ProcessEnv): string {
  const isProduction = env.NODE_ENV === 'production';

  const apiOrigin = originOf(env.NEXT_PUBLIC_API_URL);
  const cdnOrigin = originOf(env.NEXT_PUBLIC_CDN_URL);
  const meiliOrigin = originOf(env.NEXT_PUBLIC_MEILI_HOST);
  // The DSN is a URL whose origin is the ingest endpoint the browser POSTs to.
  const sentryOrigin = originOf(env.NEXT_PUBLIC_SENTRY_DSN);
  const posthogOrigin = originOf(env.NEXT_PUBLIC_POSTHOG_HOST);

  const extraFormOrigins = (env.NEXT_PUBLIC_PAYMENT_FORM_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],

    // See the note at the top of this file for why 'unsafe-inline' is here.
    'script-src': unique([
      "'self'",
      "'unsafe-inline'",
      STRIPE_SCRIPT,
      // PostHog ships its session recorder as a separate bundle fetched from
      // the ingest host at runtime, so bundling posthog-js is not enough.
      posthogOrigin,
    ]),

    // Tailwind is compiled, but Framer Motion animates by writing inline
    // `style` attributes and next/font injects a <style> block. Neither is
    // avoidable, and `style-src` is a far weaker vector than `script-src`.
    'style-src': ["'self'", "'unsafe-inline'"],

    'img-src': unique([
      "'self'",
      // Fonepay returns its QR as a data URL, and blurhash placeholders are
      // painted to a canvas and read back as a blob.
      'data:',
      'blob:',
      cdnOrigin,
      MAP_TILES,
      ...IMAGE_HOSTS,
    ]),

    'font-src': ["'self'", 'data:'],

    'connect-src': unique([
      "'self'",
      apiOrigin,
      apiOrigin ? websocketOrigin(apiOrigin) : null,
      cdnOrigin,
      meiliOrigin,
      sentryOrigin,
      posthogOrigin,
      STRIPE_API,
    ]),

    'frame-src': STRIPE_FRAME,

    // Nothing embeds Bazaar. Both this and the X-Frame-Options header in
    // next.config.ts are sent, because older browsers honour only the latter.
    'frame-ancestors': ["'none'"],

    'form-action': unique(["'self'", ...PAYMENT_FORM_ORIGINS, ...extraFormOrigins]),

    // No Flash, no Java, no <object> of any kind.
    'object-src': ["'none'"],

    // Stops an injected <base> tag from re-pointing every relative URL on the
    // page at an attacker's host.
    'base-uri': ["'self'"],

    // The service worker, plus blob: for PostHog's compression worker.
    'worker-src': ["'self'", 'blob:'],

    'manifest-src': ["'self'"],
  };

  const policy = Object.entries(directives).map(
    ([directive, values]) => `${directive} ${values.join(' ')}`,
  );

  // Rewrites any http:// subresource that slipped through to https:// rather
  // than blocking it as mixed content. Not in development, where the API and
  // the storefront are both plain http on localhost and this would break every
  // request between them.
  if (isProduction) policy.push('upgrade-insecure-requests');

  return policy.join('; ');
}
