import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PaymentStatus } from '@bazaar/shared';

import { EsewaGateway } from './esewa.gateway';
import type { PaymentContext } from '../payment-gateway';

/**
 * eSewa's signature is the part of this integration that cannot be checked by
 * reading it - a single wrong character in the signed string produces a
 * plausible-looking base64 blob that eSewa silently rejects. These tests pin
 * the exact bytes.
 */

/** eSewa's own published sandbox credentials. */
const MERCHANT_CODE = 'EPAYTEST';
const SECRET_KEY = '8gBm/:&EnhH.1/q';

function gatewayWith(overrides: Record<string, string> = {}): EsewaGateway {
  const values: Record<string, string> = {
    ESEWA_MERCHANT_CODE: MERCHANT_CODE,
    ESEWA_SECRET_KEY: SECRET_KEY,
    ESEWA_BASE_URL: 'https://rc-epay.esewa.com.np',
    API_PUBLIC_URL: 'https://api.example.com/api/v1',
    ...overrides,
  };

  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;

  return new EsewaGateway(config);
}

function contextFor(total: number, shipping = 0, tax = 0): PaymentContext {
  return {
    order: {
      id: 'order-1',
      orderNumber: 'ORD-20260901-AB12',
      total,
      currency: 'NPR',
      subtotal: total - shipping - tax,
      shippingCost: shipping,
      taxAmount: tax,
    },
    paymentId: '11111111-2222-3333-4444-555555555555',
    customer: { email: 'shopper@example.com', fullName: 'Test Shopper', phone: '9800000000' },
  };
}

describe('EsewaGateway', () => {
  describe('isConfigured', () => {
    it('is configured when both the code and secret are present', () => {
      expect(gatewayWith().isConfigured()).toBe(true);
    });

    it('is not configured when the secret is missing', () => {
      expect(gatewayWith({ ESEWA_SECRET_KEY: '' }).isConfigured()).toBe(false);
    });
  });

  describe('initiate', () => {
    it('signs exactly total_amount, transaction_uuid and product_code, in that order', async () => {
      const init = await gatewayWith().initiate(contextFor(1500, 100, 130));

      if (init.kind !== 'form_post') throw new Error('expected a form post');

      // The contract eSewa documents: the signed string is built from the
      // fields named in signed_field_names, in that order, as `key=value`
      // pairs joined by commas.
      expect(init.fields.signed_field_names).toBe(
        'total_amount,transaction_uuid,product_code',
      );

      const expected = createHmac('sha256', SECRET_KEY)
        .update(
          `total_amount=${init.fields.total_amount},` +
            `transaction_uuid=${init.fields.transaction_uuid},` +
            `product_code=${init.fields.product_code}`,
        )
        .digest('base64');

      expect(init.fields.signature).toBe(expected);
    });

    it('formats every amount to exactly two decimals', async () => {
      // 1500 must sign as "1500.00" - signing "1500" produces a different hash
      // from the one eSewa computes, and the payment is rejected.
      const init = await gatewayWith().initiate(contextFor(1500, 100, 130));

      if (init.kind !== 'form_post') throw new Error('expected a form post');

      expect(init.fields.total_amount).toBe('1500.00');
      expect(init.fields.tax_amount).toBe('130.00');
      expect(init.fields.product_delivery_charge).toBe('100.00');
      expect(init.fields.amount).toBe('1270.00');
    });

    it('sends the payment id as transaction_uuid so the callback can be traced', async () => {
      const context = contextFor(500);
      const init = await gatewayWith().initiate(context);

      if (init.kind !== 'form_post') throw new Error('expected a form post');
      expect(init.fields.transaction_uuid).toBe(context.paymentId);
    });

    it('points the callbacks at the public API URL, not the site URL', async () => {
      const init = await gatewayWith().initiate(contextFor(500));

      if (init.kind !== 'form_post') throw new Error('expected a form post');
      expect(init.fields.success_url).toBe('https://api.example.com/api/v1/payments/esewa/success');
      expect(init.fields.failure_url).toBe('https://api.example.com/api/v1/payments/esewa/failure');
    });

    it('refuses to build a form without credentials', async () => {
      await expect(
        gatewayWith({ ESEWA_SECRET_KEY: '' }).initiate(contextFor(500)),
      ).rejects.toThrow(/not configured/i);
    });
  });

  describe('verify', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function mockStatus(body: unknown, ok = true) {
      const fetchMock = jest.fn().mockResolvedValue({
        ok,
        status: ok ? 200 : 500,
        json: () => Promise.resolve(body),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    /** eSewa hands the browser a base64 JSON blob on the success URL. */
    function callbackData(fields: Record<string, string>): string {
      return Buffer.from(JSON.stringify(fields)).toString('base64');
    }

    it('asks eSewa directly rather than trusting the callback payload', async () => {
      const fetchMock = mockStatus({
        status: 'COMPLETE',
        ref_id: '0KDL9BL',
        total_amount: 1500,
        transaction_uuid: 'payment-1',
      });

      const result = await gatewayWith().verify({
        data: callbackData({ transaction_uuid: 'payment-1', total_amount: '1500.0' }),
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
      expect(url.origin).toBe('https://rc.esewa.com.np');
      expect(url.searchParams.get('transaction_uuid')).toBe('payment-1');
      expect(url.searchParams.get('product_code')).toBe(MERCHANT_CODE);

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(result.transactionId).toBe('0KDL9BL');
      expect(result.amount).toBe(1500);
    });

    it('strips the thousands separators eSewa echoes back', async () => {
      // "1,250.00" would parse as NaN and fail the amount check on a payment
      // that actually succeeded.
      const fetchMock = mockStatus({ status: 'COMPLETE', ref_id: 'X', total_amount: '1,250.00' });

      const result = await gatewayWith().verify({
        data: callbackData({ transaction_uuid: 'payment-1', total_amount: '1,250.00' }),
      });

      const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
      expect(url.searchParams.get('total_amount')).toBe('1250.00');
      expect(result.amount).toBe(1250);
    });

    it('treats any status other than COMPLETE as a failure', async () => {
      mockStatus({ status: 'PENDING', transaction_uuid: 'payment-1' });

      const result = await gatewayWith().verify({
        data: callbackData({ transaction_uuid: 'payment-1', total_amount: '100' }),
      });

      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(result.failureReason).toContain('PENDING');
    });

    it('rejects a callback that identifies no transaction', async () => {
      mockStatus({});
      await expect(gatewayWith().verify({})).rejects.toThrow(/did not identify/i);
    });

    it('queries the production host when configured for production', async () => {
      const fetchMock = mockStatus({ status: 'COMPLETE', ref_id: 'X', total_amount: 10 });

      await gatewayWith({ ESEWA_BASE_URL: 'https://epay.esewa.com.np' }).verify({
        data: callbackData({ transaction_uuid: 'p', total_amount: '10' }),
      });

      const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
      expect(url.origin).toBe('https://esewa.com.np');
    });
  });

  describe('refund', () => {
    it('reports refunds as manual rather than pretending they succeeded', async () => {
      const result = await gatewayWith().refund({
        payment: {
          id: 'p1',
          transactionId: '0KDL9BL',
          amount: 1500,
          currency: 'NPR',
          gatewayResponse: null,
        },
        amount: 1500,
        reason: 'Customer changed their mind',
      });

      expect(result.isAutomated).toBe(false);
      expect(result.status).toBe('PENDING');
      expect(result.message).toContain('0KDL9BL');
    });
  });
});
