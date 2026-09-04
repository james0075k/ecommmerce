import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, ReviewNotice } from '@/components/layout/legal-page';

export const metadata: Metadata = {
  title: 'Terms of service',
  description:
    'The agreement between you and Bazaar: ordering, pricing, delivery, accounts and liability.',
};

const UPDATED = '2026-09-04';

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated={UPDATED}
      summary="The agreement between you and Bazaar when you use this store."
    >
      <ReviewNotice />

      <h2>1. Who this is between</h2>
      <p>
        &ldquo;Bazaar&rdquo;, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean the operator of
        this store, registered in Nepal. &ldquo;You&rdquo; means anyone who browses it,
        holds an account on it, or places an order through it. Using the site means
        accepting these terms.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must be 16 or older to hold an account.</li>
        <li>
          The details on your account must be accurate. A delivery sent to an address
          you typed incorrectly is not a failed delivery on our part.
        </li>
        <li>
          You are responsible for what happens under your account. Tell us immediately
          if you think someone else has access to it.
        </li>
        <li>
          Guest checkout is available. An order placed without an account is reachable
          only through the link in its confirmation email — keep it.
        </li>
      </ul>

      <h2>3. Prices and payment</h2>
      <ul>
        <li>
          Prices are in Nepalese rupees and include VAT unless a product page says
          otherwise. Delivery is charged separately and shown before you pay.
        </li>
        <li>
          Prices and stock can change until an order is confirmed. If a price is wrong
          by an obvious margin, we may cancel the order and refund you in full rather
          than honour it.
        </li>
        <li>
          We accept eSewa, Khalti, ConnectIPS, Fonepay, IME Pay, card payments through
          Stripe, and cash on delivery where it is offered.
        </li>
        <li>
          Payments settled outside Nepal are converted at the rate shown at checkout.
          Your bank may add its own fee, which we do not receive and cannot refund.
        </li>
      </ul>

      <h2>4. When an order becomes a contract</h2>
      <p>
        Adding to a cart is not an order and placing an order is not yet an agreement to
        sell. The contract forms when we confirm the order — which is also when stock is
        committed to you. Until then we may decline an order, for example where stock has
        run out, an address is outside our delivery area, or a payment cannot be
        verified. You will be refunded in full if we do.
      </p>

      <h2>5. Delivery</h2>
      <ul>
        <li>
          We deliver to all 77 districts. Delivery time depends on the district and is
          estimated at checkout; estimates are not guarantees.
        </li>
        <li>
          Someone must be available to receive the order. A cash-on-delivery order that
          is refused on arrival may make the account ineligible for cash on delivery
          afterwards.
        </li>
        <li>
          Risk passes to you on delivery. If a package arrives damaged, refuse it or
          tell us within 48 hours with photographs.
        </li>
      </ul>

      <h2>6. Returns and refunds</h2>
      <p>
        Covered separately, in full, in the <Link href="/refunds">refund policy</Link>.
        It forms part of these terms.
      </p>

      <h2>7. Reviews and anything else you post</h2>
      <ul>
        <li>Reviews may be left only for products you have actually bought here.</li>
        <li>
          Do not post anything unlawful, abusive, or someone else&rsquo;s personal
          information. We remove reviews that break this and may close the account.
        </li>
        <li>
          You keep ownership of what you write, and grant us a licence to display it on
          the store and in related material.
        </li>
        <li>We do not edit reviews to make them more favourable, and we do not buy them.</li>
      </ul>

      <h2>8. Acceptable use</h2>
      <p>
        Do not attempt to break, overload or circumvent the site&rsquo;s security; do not
        scrape the catalogue at a volume that degrades it for other shoppers; do not
        resell access to it. Rate limits apply to every endpoint and are enforced.
      </p>

      <h2>9. Our content</h2>
      <p>
        The Bazaar name, the design of this site and its code are ours. Product images
        and descriptions supplied by manufacturers remain theirs. Nothing here may be
        copied for commercial use without permission.
      </p>

      <h2>10. Availability</h2>
      <p>
        We aim to keep the store available, and we do not promise it will never be down.
        Maintenance, a failure at a payment gateway, or an outage at an infrastructure
        provider can all interrupt it. We are not liable for losses caused by an
        interruption, beyond refunding an order we cannot fulfil.
      </p>

      <h2>11. Liability</h2>
      <p>
        Our liability for any order is limited to the amount paid for it. Nothing in
        these terms limits liability for death, personal injury, or fraud, or removes
        any right you have under the Consumer Protection Act 2075 — those rights exist
        whatever this page says.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may change these terms. The version in force for an order is the one
        published when the order was placed, and material changes are announced on the
        site before they take effect.
      </p>

      <h2>13. Law and disputes</h2>
      <p>
        These terms are governed by the laws of Nepal, and the courts of Kathmandu have
        jurisdiction. Talk to us first —{' '}
        <a href="mailto:support@bazaar.com.np">support@bazaar.com.np</a> — almost
        everything is resolved that way.
      </p>
    </LegalPage>
  );
}
