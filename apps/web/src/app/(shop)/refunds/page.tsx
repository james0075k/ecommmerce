import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, ReviewNotice } from '@/components/layout/legal-page';

export const metadata: Metadata = {
  title: 'Returns and refunds',
  description:
    'How to return something to Bazaar, what can be returned, and how long a refund takes on each payment method.',
};

const UPDATED = '2026-09-04';

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Returns and refunds"
      updated={UPDATED}
      summary="What can be returned, how to start a return, and when the money arrives."
    >
      <ReviewNotice />

      <h2>The short version</h2>
      <p>
        Seven days to change your mind on most things, provided they come back unused
        and in their packaging. Faulty or wrong items are our problem and our cost, for
        30 days. Refunds go back the way you paid.
      </p>

      <h2>What can be returned</h2>
      <ul>
        <li>
          <strong>Changed your mind:</strong> within 7 days of delivery, unused, complete
          and in the original packaging with tags attached.
        </li>
        <li>
          <strong>Faulty, damaged or not what you ordered:</strong> within 30 days of
          delivery. Return shipping is on us, and so is the replacement.
        </li>
        <li>
          <strong>Damaged in transit:</strong> tell us within 48 hours of delivery, with
          photographs of the packaging as well as the item.
        </li>
      </ul>

      <h2>What cannot</h2>
      <ul>
        <li>Underwear, swimwear, cosmetics and other hygiene items, once opened.</li>
        <li>Perishables, and anything sold as clearance or final sale.</li>
        <li>Digital products and downloads once they have been accessed.</li>
        <li>Gift cards.</li>
        <li>
          Made-to-order or personalised items, unless they arrive faulty — in which case
          they are covered like anything else.
        </li>
      </ul>
      <p>
        None of this limits your rights under the Consumer Protection Act 2075. An item
        that is not of satisfactory quality can be returned whatever list it appears on.
      </p>

      <h2>How to start a return</h2>
      <ol>
        <li>
          Open the order in <Link href="/orders">your orders</Link> and choose{' '}
          <strong>Request a return</strong>. Guests: use the link in the confirmation
          email.
        </li>
        <li>
          Say what is wrong and attach photographs for anything damaged or faulty. This
          is what lets us approve most requests the same day.
        </li>
        <li>
          We reply with an approval and return instructions, usually within two working
          days.
        </li>
        <li>
          Send the item back, or hand it to the courier we arrange. Keep the tracking
          number until the refund lands.
        </li>
      </ol>

      <h2>Who pays the return shipping</h2>
      <table>
        <thead>
          <tr>
            <th>Reason</th>
            <th>Who pays</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Faulty, damaged, or the wrong item sent</td>
            <td>We do, both ways.</td>
          </tr>
          <tr>
            <td>Changed your mind</td>
            <td>You do. The original delivery charge is not refunded.</td>
          </tr>
        </tbody>
      </table>

      <h2>When the money arrives</h2>
      <p>
        We start the refund within two working days of receiving and inspecting the
        return. How long it then takes is up to the payment provider, not us:
      </p>
      <table>
        <thead>
          <tr>
            <th>Paid with</th>
            <th>Typical time after we release it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>eSewa, Khalti, IME Pay</td>
            <td>1–3 working days, back to the same wallet.</td>
          </tr>
          <tr>
            <td>ConnectIPS, Fonepay</td>
            <td>3–5 working days, back to the same bank account.</td>
          </tr>
          <tr>
            <td>Card (Stripe)</td>
            <td>5–10 working days, back to the same card. Your bank sets this.</td>
          </tr>
          <tr>
            <td>Cash on delivery</td>
            <td>
              1–3 working days by bank transfer, to account details you give us at the
              time.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Refunds always return to the original payment method. We cannot send a card
        refund to a wallet, and a request to do so is the most common sign of a
        compromised account.
      </p>

      <h2>Exchanges</h2>
      <p>
        We refund and let you re-order rather than swapping items directly. It is
        faster: an exchange holds your money while stock is checked twice, and a
        re-order takes the size you actually want out of live stock immediately.
      </p>

      <h2>Cancelling before it ships</h2>
      <p>
        An order can be cancelled from your order page at any point before it is marked
        as shipped, with a full refund including delivery. Once it has shipped it
        becomes a return.
      </p>

      <h2>Questions</h2>
      <p>
        <a href="mailto:support@bazaar.com.np">support@bazaar.com.np</a>, with the order
        number in the subject line.
      </p>
    </LegalPage>
  );
}
