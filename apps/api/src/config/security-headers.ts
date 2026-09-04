import type { ConfigService } from '@nestjs/config';
import type helmet from 'helmet';

type HelmetOptions = Parameters<typeof helmet>[0];

/** Two years, the minimum the HSTS preload list accepts. */
const HSTS_MAX_AGE_SECONDS = 63_072_000;

/**
 * D4 security headers for the API (Phase 12.9).
 *
 * The API answers with JSON, CSV and PDF and never with a document, so its
 * content security policy can be the strictest one there is: `default-src
 * 'none'` denies every fetch a page loaded from this origin could make, which
 * matters because "a page loaded from this origin" should never exist. If an
 * error template or a gateway callback ever starts returning HTML, this is the
 * file that has to change first - and the browser refusing to run it is the
 * point.
 */
export function buildHelmetOptions(config: ConfigService): HelmetOptions {
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        // Nothing here is embeddable and nothing here is a document, so both
        // clickjacking vectors are closed rather than mitigated.
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        // Without this a PDF invoice served over http:// on a page loaded over
        // https:// is blocked as mixed content; with it the browser upgrades
        // the request instead. Only in production - `next dev` has no TLS.
        ...(isProduction ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },

    /**
     * HSTS (Phase 12.9 "HTTPS enforced"). Two years with subdomains, and
     * `preload` so browsers ship the entry rather than learning it on a first
     * visit that is itself unprotected.
     *
     * Only in production, and this is not pedantry: a `localhost` HSTS entry is
     * cached by the browser for two years and then poisons every other project
     * you serve from localhost over http. It is genuinely difficult to undo.
     */
    strictTransportSecurity: isProduction
      ? { maxAge: HSTS_MAX_AGE_SECONDS, includeSubDomains: true, preload: true }
      : false,

    // The storefront calls this API with `fetch`, which CORS governs; nothing
    // is ever loaded from it as an <img> or <script>. Keeping helmet's
    // same-origin default therefore costs nothing and blocks embedding.
    crossOriginResourcePolicy: { policy: 'same-origin' },

    // Left off deliberately: it demands CORP headers on every cross-origin
    // subresource, and the API has no page to isolate.
    crossOriginEmbedderPolicy: false,

    referrerPolicy: { policy: 'no-referrer' },

    // `X-Powered-By: Express` names the framework to anyone scanning.
    hidePoweredBy: true,
  };
}
