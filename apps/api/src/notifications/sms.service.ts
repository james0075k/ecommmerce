import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SMS via Sparrow SMS (Nepal).
 *
 * When SPARROW_SMS_TOKEN is absent the message is logged instead of sent, so
 * the phone-OTP flow is testable locally - the code appears in the API console.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly token: string | undefined;
  private readonly from: string;
  private static readonly ENDPOINT = 'https://api.sparrowsms.com/v2/sms/';

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('SPARROW_SMS_TOKEN') || undefined;
    this.from = this.config.get<string>('SPARROW_SMS_FROM') ?? 'Bazaar';

    if (!this.token) {
      this.logger.warn('SPARROW_SMS_TOKEN is not set - SMS will be logged, not sent.');
    }
  }

  async sendOtp(phone: string, otp: string, expiryMinutes: number): Promise<void> {
    await this.send(
      phone,
      `${otp} is your Bazaar verification code. It expires in ${expiryMinutes} minutes. Do not share it with anyone.`,
    );
  }

  async sendOrderConfirmation(phone: string, orderNumber: string): Promise<void> {
    await this.send(phone, `Your Bazaar order ${orderNumber} is confirmed. Thank you!`);
  }

  private async send(to: string, text: string): Promise<void> {
    if (!this.token) {
      this.logger.log(`[sms:not-sent] to=${to} :: ${text}`);
      return;
    }

    try {
      const response = await fetch(SmsService.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          from: this.from,
          to: normalizeNepaliNumber(to),
          text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Sparrow SMS responded ${response.status}: ${await response.text()}`);
      }

      this.logger.log(`SMS sent to ${to}`);
    } catch (error) {
      // Never fail the request because the gateway is down - the caller decides
      // how to surface it (the OTP endpoint reports a generic failure).
      this.logger.error(
        `Failed to send SMS to ${to}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Sparrow expects a bare 10-digit number, not +977 form. */
function normalizeNepaliNumber(phone: string): string {
  return phone.replace(/[\s-]/g, '').replace(/^\+?977/, '');
}
