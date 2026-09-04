import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, ReviewNotice } from '@/components/layout/legal-page';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What Bazaar collects, why, how long it is kept, and how to get a copy or have it deleted.',
};

const UPDATED = '2026-09-04';

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated={UPDATED}
      summary="What we collect, why we collect it, and what you can ask us to do with it."
    >
      <ReviewNotice />

      <p>
        This policy covers the Bazaar storefront and the account behind it. It describes
        what the software actually stores, rather than the widest set of things it might
        conceivably do — the two are usually not the same, and the second is not much
        use to anyone reading it.
      </p>

      <h2>What we collect</h2>

      <h3>Because you gave it to us</h3>
      <ul>
        <li>
          <strong>Account:</strong> name, email address, phone number, and a password
          that is stored only as an Argon2id hash. We cannot read your password, and
          neither can anyone who obtains the database.
        </li>
        <li>
          <strong>Delivery addresses:</strong> province, district, municipality, ward,
          street and landmark, plus an optional contact number for the courier.
        </li>
        <li>
          <strong>Orders:</strong> what you bought, what you paid, where it went, and
          the status history of the delivery.
        </li>
        <li>
          <strong>Reviews:</strong> your rating, your text, and the display name shown
          beside it.
        </li>
      </ul>

      <h3>Because the site needs it to work</h3>
      <ul>
        <li>
          <strong>Session cookies:</strong> an HttpOnly refresh-token cookie that keeps
          you signed in, and a cart identifier so a basket survives a closed tab. These
          are strictly necessary and are not optional.
        </li>
        <li>
          <strong>IP address and browser user agent:</strong> recorded with sign-in
          attempts and with administrator actions, for rate limiting and for the audit
          log. This is how a compromised account is investigated.
        </li>
        <li>
          <strong>Page views:</strong> the path you visited, the referring site for the
          first page of a visit, and a random identifier that is created when you arrive
          and destroyed when you close the tab. It is not linked to your account and
          cannot be used to recognise you on a later visit.
        </li>
      </ul>

      <h3>Only if you agree to it</h3>
      <ul>
        <li>
          <strong>Product analytics and session replay (PostHog):</strong> loaded only
          after you accept analytics cookies, and not downloaded at all until then.
          Replays mask every form field, so what you type — including addresses and card
          details — is never recorded. You can withdraw consent at any time from{' '}
          <strong>Cookie preferences</strong> in the footer.
        </li>
      </ul>

      <h2>What we never have</h2>
      <p>
        <strong>Card numbers.</strong> Card details are entered into a Stripe-hosted
        field and go straight to Stripe. They do not pass through our servers and are
        not stored by us in any form. eSewa, Khalti, ConnectIPS, Fonepay and IME Pay
        each take payment on their own site or app; we receive only a transaction
        reference and a result.
      </p>

      <h2>Who else sees your data</h2>
      <table>
        <thead>
          <tr>
            <th>Who</th>
            <th>What they get</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Payment gateways</td>
            <td>Order amount, reference, and whatever their own checkout collects.</td>
          </tr>
          <tr>
            <td>Delivery partners</td>
            <td>Recipient name, address and phone number for the order they carry.</td>
          </tr>
          <tr>
            <td>Email and SMS providers</td>
            <td>Your email address or phone number, and the message being sent.</td>
          </tr>
          <tr>
            <td>Error monitoring (Sentry)</td>
            <td>
              Technical details of a failure. Cookies and authorisation headers are
              stripped before the report leaves your browser or our server.
            </td>
          </tr>
          <tr>
            <td>Product analytics (PostHog)</td>
            <td>Only with your consent, and only what is described above.</td>
          </tr>
        </tbody>
      </table>
      <p>
        We do not sell personal data, and we do not share it for anyone else&rsquo;s
        advertising.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <strong>Orders and invoices:</strong> retained as long as tax and accounting
          rules require. These cannot be deleted on request while that period runs.
        </li>
        <li>
          <strong>Account details:</strong> until you delete the account.
        </li>
        <li>
          <strong>Sign-in and admin audit records:</strong> kept for a rolling period so
          a security incident can be investigated after it is discovered.
        </li>
        <li>
          <strong>Page views:</strong> aggregated for reporting; the raw rows are pruned
          on a schedule.
        </li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          Read, correct or export your account details and addresses from{' '}
          <Link href="/account">your account</Link>.
        </li>
        <li>
          Ask for your account to be deleted. Orders that must be retained for tax
          purposes are kept, detached from your profile where that is possible.
        </li>
        <li>Withdraw analytics consent from the footer, at any time, in one click.</li>
        <li>
          Opt out of marketing email from any message we send; transactional email about
          an order you placed is not marketing and cannot be switched off.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Traffic is served over HTTPS with HSTS. Passwords are hashed with Argon2id.
        Sessions use short-lived access tokens with a refresh token in an HttpOnly
        cookie, so a script on a compromised page cannot read it. Administrative actions
        are logged. None of this makes a breach impossible; it makes one containable,
        and it is what we would want from a store we shopped at.
      </p>

      <h2>Contact</h2>
      <p>
        Write to <a href="mailto:privacy@bazaar.com.np">privacy@bazaar.com.np</a> for
        anything in this policy, including a request for a copy of your data or its
        deletion. We answer within 30 days.
      </p>
    </LegalPage>
  );
}
