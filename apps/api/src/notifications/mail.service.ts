import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
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
