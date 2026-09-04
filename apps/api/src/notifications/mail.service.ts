import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface OrderConfirmationDetails {
  orderId: string;
  orderNumber: string;
  total: number;
  currency: string;
  items: Array<{ name: string; quantity: number; total: number }>;
}

export interface ShippingNotificationDetails {
  orderId: string;
  orderNumber: string;
  trackingNumber: string;
  carrierLabel: string | null;
  trackingUrl: string | null;
  estimatedDeliveryDate: string | null;
}

export interface ReviewRequestDetails {
  orderId: string;
  orderNumber: string;
  productNames: string[];
}

export interface StatusUpdateDetails {
  orderId: string;
  orderNumber: string;
  /** One line, already phrased for the shopper ("Your order is being packed"). */
  headline: string;
  note: string | null;
}

export interface RefundNotificationDetails {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  reason: string;
  /** "eSewa", "Khalti", "your card" - what the shopper actually paid with. */
  methodLabel: string;
}

/**
 * Transactional email via Resend.
 *
 * When RESEND_API_KEY is absent the message is logged instead of sent, so the
 * register and password-reset flows are testable locally without an account.
 * The verification/reset link is printed in full - copy it from the API console.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly siteUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = this.config.get<string>('EMAIL_FROM') ?? 'Bazaar <onboarding@resend.dev>';
    this.siteUrl = this.config.get<string>('NEXTAUTH_URL') ?? 'http://localhost:3000';

    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY is not set - emails will be logged, not sent.');
    }
  }

  async sendVerificationEmail(to: string, fullName: string, token: string): Promise<void> {
    const link = `${this.siteUrl}/verify-email?token=${token}`;

    await this.send({
      to,
      subject: 'Confirm your email address',
      text: `Hi ${fullName},\n\nConfirm your email address to finish setting up your Bazaar account:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this message.`,
      html: this.layout(
        'Confirm your email address',
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>Confirm your email address to finish setting up your Bazaar account.</p>`,
        'Confirm email',
        link,
        'This link expires in 24 hours. If you did not create an account, you can ignore this message.',
      ),
    });
  }

  async sendPasswordResetEmail(to: string, fullName: string, token: string): Promise<void> {
    const link = `${this.siteUrl}/reset-password?token=${token}`;

    await this.send({
      to,
      subject: 'Reset your password',
      text: `Hi ${fullName},\n\nReset your Bazaar password here:\n${link}\n\nThis link expires in 1 hour. If you did not ask to reset your password, nothing has changed.`,
      html: this.layout(
        'Reset your password',
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>Use the button below to choose a new password.</p>`,
        'Reset password',
        link,
        'This link expires in 1 hour. If you did not ask to reset your password, nothing has changed.',
      ),
    });
  }

  async sendWelcomeEmail(to: string, fullName: string): Promise<void> {
    await this.send({
      to,
      subject: 'Welcome to Bazaar',
      text: `Hi ${fullName},\n\nYour email is confirmed and your account is ready. Start shopping at ${this.siteUrl}.`,
      html: this.layout(
        'Your account is ready',
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>Your email is confirmed. Everything is ready when you are.</p>`,
        'Start shopping',
        this.siteUrl,
        '',
      ),
    });
  }

  /**
   * Order confirmation, sent once the payment is settled (F1.6).
   *
   * Deliberately not sent at checkout: an order sitting at PENDING has not been
   * paid for, and an email saying "confirmed" for an abandoned eSewa redirect
   * would be a lie the shopper acts on.
   */
  async sendOrderConfirmation(
    to: string,
    fullName: string,
    order: OrderConfirmationDetails,
  ): Promise<void> {
    const link = `${this.siteUrl}/orders/${order.orderId}/confirmation`;
    const money = (value: number) => `${order.currency} ${value.toFixed(2)}`;

    const lines = order.items
      .map((item) => `  ${item.quantity} x ${item.name} - ${money(item.total)}`)
      .join('\n');

    const rows = order.items
      .map(
        (item) =>
          `<tr>
             <td style="padding:6px 0;font-size:14px">${escapeHtml(item.name)}
               <span style="color:#8B95AD">x${item.quantity}</span></td>
             <td style="padding:6px 0;font-size:14px;text-align:right;white-space:nowrap">${money(item.total)}</td>
           </tr>`,
      )
      .join('');

    await this.send({
      to,
      subject: `Order ${order.orderNumber} confirmed`,
      text:
        `Hi ${fullName},\n\nThanks - your order ${order.orderNumber} is confirmed.\n\n` +
        `${lines}\n\nTotal: ${money(order.total)}\n\nTrack it at ${link}`,
      html: this.layout(
        `Order ${escapeHtml(order.orderNumber)} confirmed`,
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>Thanks for your order. We are getting it ready now.</p>
         <table role="presentation" style="width:100%;margin:20px 0;border-top:1px solid #E6E9F0;border-bottom:1px solid #E6E9F0">
           ${rows}
           <tr>
             <td style="padding:10px 0;font-size:15px;font-weight:700;color:#1A1A2E">Total</td>
             <td style="padding:10px 0;font-size:15px;font-weight:700;text-align:right;color:#1A1A2E">${money(order.total)}</td>
           </tr>
         </table>`,
        'Track your order',
        link,
        'You will get another email as soon as it ships.',
      ),
    });
  }


  /**
   * Shipping notification, sent the moment an order is marked SHIPPED (F1.3).
   *
   * The tracking link is resolved by the caller, because only the server knows
   * which couriers have a public tracking page - the number is still printed in
   * full so it can be pasted anywhere.
   */
  async sendShippingNotification(
    to: string,
    fullName: string,
    order: ShippingNotificationDetails,
  ): Promise<void> {
    const link = `${this.siteUrl}/orders/${order.orderId}`;
    const carrier = order.carrierLabel ?? 'our courier partner';

    const trackingBlock = order.trackingUrl
      ? `<p style="margin:16px 0 0"><a href="${order.trackingUrl}" style="color:#6C3CE1;font-weight:600">Track it with ${escapeHtml(carrier)}</a></p>`
      : '';

    await this.send({
      to,
      subject: `Order ${order.orderNumber} is on its way`,
      text:
        `Hi ${fullName},

Your order ${order.orderNumber} has been handed to ${carrier}.

` +
        `Tracking number: ${order.trackingNumber}
` +
        (order.trackingUrl ? `Track it: ${order.trackingUrl}
` : '') +
        (order.estimatedDeliveryDate
          ? `Estimated delivery: ${formatDay(order.estimatedDeliveryDate)}
`
          : '') +
        `
Order details: ${link}`,
      html: this.layout(
        'Your order has shipped',
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>Order <strong>${escapeHtml(order.orderNumber)}</strong> has been handed to
            ${escapeHtml(carrier)}.</p>
         <table role="presentation" style="width:100%;margin:20px 0;border-top:1px solid #E6E9F0;border-bottom:1px solid #E6E9F0">
           <tr>
             <td style="padding:10px 0;font-size:14px;color:#8B95AD">Tracking number</td>
             <td style="padding:10px 0;font-size:14px;text-align:right;font-weight:600">${escapeHtml(order.trackingNumber)}</td>
           </tr>
           ${
             order.estimatedDeliveryDate
               ? `<tr>
                    <td style="padding:10px 0;font-size:14px;color:#8B95AD">Arriving by</td>
                    <td style="padding:10px 0;font-size:14px;text-align:right;font-weight:600">${formatDay(order.estimatedDeliveryDate)}</td>
                  </tr>`
               : ''
           }
         </table>
         ${trackingBlock}`,
        'View your order',
        link,
        'Nobody will ask you to pay again for a shipped order - if someone does, it is not us.',
      ),
    });
  }

  /**
   * "How did we do?", seven days after delivery (F1.3).
   *
   * Seven days rather than on delivery: asking someone to review a parcel they
   * have not opened yet produces noise, and the delay is what makes the answer
   * worth showing on the product page.
   */
  async sendReviewRequest(
    to: string,
    fullName: string,
    order: ReviewRequestDetails,
  ): Promise<void> {
    const link = `${this.siteUrl}/orders/${order.orderId}?review=1`;
    const names = order.productNames.slice(0, 3).join(', ');

    await this.send({
      to,
      subject: `How was your order ${order.orderNumber}?`,
      text:
        `Hi ${fullName},

Your order ${order.orderNumber} arrived a week ago. ` +
        `If you have a minute, tell other shoppers what you think of ${names}.

${link}`,
      html: this.layout(
        'How did we do?',
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>Your order arrived a week ago. If you have a minute, tell other shoppers what you
            make of <strong>${escapeHtml(names)}</strong>.</p>`,
        'Leave a review',
        link,
        'One honest sentence helps more than five stars on their own.',
      ),
    });
  }

  /** A status change an operator wrote a note against. */
  async sendOrderStatusUpdate(
    to: string,
    fullName: string,
    order: StatusUpdateDetails,
  ): Promise<void> {
    const link = `${this.siteUrl}/orders/${order.orderId}`;

    await this.send({
      to,
      subject: `Order ${order.orderNumber}: ${order.headline}`,
      text: `Hi ${fullName},

${order.headline}${order.note ? `

${order.note}` : ''}

${link}`,
      html: this.layout(
        escapeHtml(order.headline),
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>There is an update on order <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
         ${order.note ? `<p style="padding:12px 14px;background:#F5F3FF;border-radius:10px">${escapeHtml(order.note)}</p>` : ''}`,
        'View your order',
        link,
        '',
      ),
    });
  }

  /**
   * Refund confirmation.
   *
   * The settlement window is stated because it is the question the shopper asks
   * next, and the honest answer depends on their bank rather than on us.
   */
  async sendRefundNotification(
    to: string,
    fullName: string,
    order: RefundNotificationDetails,
  ): Promise<void> {
    const link = `${this.siteUrl}/orders/${order.orderId}`;
    const money = `${order.currency} ${order.amount.toFixed(2)}`;

    await this.send({
      to,
      subject: `Refund issued for order ${order.orderNumber}`,
      text:
        `Hi ${fullName},

We have refunded ${money} for order ${order.orderNumber}.

` +
        `Reason: ${order.reason}

` +
        `It usually reaches your ${order.methodLabel} account within 5-7 working days.

${link}`,
      html: this.layout(
        'Your refund is on its way',
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>We have refunded <strong>${money}</strong> for order
            <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
         <p style="padding:12px 14px;background:#F5F3FF;border-radius:10px">${escapeHtml(order.reason)}</p>
         <p>It usually reaches your ${escapeHtml(order.methodLabel)} account within 5-7 working days.</p>`,
        'View your order',
        link,
        'If it has not arrived after a week, reply to this email and we will chase it.',
      ),
    });
  }

  /**
   * A free-form message an admin composed - a reply to a contact form, or a
   * note sent from a customer's detail page (Phase 8).
   *
   * The body is escaped rather than trusted as HTML. An operator typing an
   * ampersand should see an ampersand, and an operator pasting markup from
   * somewhere else should not have it rendered by every recipient's client;
   * newlines become `<br>` so the message still reads as it was typed.
   */
  async sendAdminMessage(
    to: string,
    recipientName: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const paragraphs = escapeHtml(body)
      .split(/\n{2,}/)
      .map((block) => `<p style="margin:0 0 14px">${block.replace(/\n/g, '<br />')}</p>`)
      .join('');

    await this.send({
      to,
      subject,
      html: this.layout(
        subject,
        `<p style="margin:0 0 14px">Hi ${escapeHtml(recipientName)},</p>${paragraphs}`,
        'Visit Bazaar',
        this.siteUrl,
        'Reply to this email and it reaches our support team directly.',
      ),
      text: `Hi ${recipientName},\n\n${body}\n\n- Bazaar support`,
    });
  }

  private async send({ to, subject, html, text }: SendArgs): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[email:not-sent] to=${to} subject="${subject}"\n${text}`);
      return;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
        text,
      });
      if (error) throw new Error(error.message);
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      // A failed email must not fail the request that triggered it - the user is
      // registered either way and can request another link.
      this.logger.error(
        `Failed to send "${subject}" to ${to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private layout(
    heading: string,
    body: string,
    ctaLabel: string,
    ctaHref: string,
    footnote: string,
  ): string {
    return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#FAFBFC;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A1A2E">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
    <tr><td>
      <p style="margin:0 0 24px;font-size:20px;font-weight:800;letter-spacing:-.02em">Bazaar</p>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-.02em">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;color:#5B6478">${body}</div>
      <p style="margin:28px 0">
        <a href="${ctaHref}" style="display:inline-block;background:#6C3CE1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;font-size:15px">${ctaLabel}</a>
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#8B95AD">${footnote}</p>
      <p style="margin:16px 0 0;font-size:12px;color:#8B95AD;word-break:break-all">Or paste this link into your browser:<br>${ctaHref}</p>
    </td></tr>
  </table>
</body></html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "12 Sep 2026" - the same shape formatDate renders in the app. */
function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-NP', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
