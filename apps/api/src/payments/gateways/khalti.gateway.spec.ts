import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@bazaar/shared';

import { KhaltiGateway } from './khalti.gateway';
import type { PaymentContext } from '../payment-gateway';

/**
 * Khalti works in paisa. Every test here exists because sending rupees where
 * paisa are expected undercharges by 100x, and reading paisa as rupees makes a
 * correct payment look like a mismatch and get refused.
 */

function gatewayWith(overrides: Record<string, string> = {}): KhaltiGateway {
  const values: Record<string, string> = {
    KHALTI_SECRET_KEY: 'test-secret-key',
    KHALTI_BASE_URL: 'https://a.khalti.com',
    API_PUBLIC_URL: 'https://api.example.com/api/v1',
    NEXT_PUBLIC_SITE_URL: 'https://shop.example.com',
    ...overrides,
  };

  return new KhaltiGateway({ get: (key: string) => values[key] } as unknown as ConfigService);
}

function contextFor(total: number): PaymentContext {
  return {
    order: {
      id: 'order-1',
      orderNumber: 'ORD-20260901-AB12',
      total,
      currency: 'NPR',
      subtotal: total,
      shippingCost: 0,
      taxAmount: 0,
    },
    paymentId: 'payment-uuid-1',
    customer: { email: 'shopper@example.com', fullName: 'Test Shopper', phone: '9800000000' },
  };
}

function mockFetch(body: unknown, ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function bodyOf(fetchMock: jest.Mock): Record<string, unknown> {
  const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('KhaltiGateway', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('is unavailable without a secret key', () => {
    expect(gatewayWith({ KHALTI_SECRET_KEY: '' }).isConfigured()).toBe(false);
    expect(gatewayWith().isConfigured()).toBe(true);
  });

  describe('initiate', () => {
    it('sends the amount in paisa, not rupees', async () => {
      const fetchMock = mockFetch({ pidx: 'pidx-1', payment_url: 'https://pay.khalti.com/x' });

      await gatewayWith().initiate(contextFor(1500));

      // Rs 1,500 must go out as 150000 paisa. Sending 1500 charges Rs 15.
      expect(bodyOf(fetchMock).amount).toBe(150_000);
    });

    it('rounds sub-paisa amounts rather than sending a float', async () => {
      const fetchMock = mockFetch({ pidx: 'p', payment_url: 'https://pay.khalti.com/x' });

      await gatewayWith().initiate(contextFor(1234.567));

      expect(bodyOf(fetchMock).amount).toBe(123_457);
      expect(Number.isInteger(bodyOf(fetchMock).amount)).toBe(true);
    });

    it('sends our payment id as purchase_order_id so the callback can find it', async () => {
      const fetchMock = mockFetch({ pidx: 'p', payment_url: 'https://pay.khalti.com/x' });

      await gatewayWith().initiate(contextFor(100));

      expect(bodyOf(fetchMock).purchase_order_id).toBe('payment-uuid-1');
      expect(bodyOf(fetchMock).return_url).toBe(
        'https://api.example.com/api/v1/payments/khalti/callback',
      );
    });

    it('authorises with the Key scheme Khalti requires', async () => {
      const fetchMock = mockFetch({ pidx: 'p', payment_url: 'https://pay.khalti.com/x' });

      await gatewayWith().initiate(contextFor(100));

      const init = (fetchMock.mock.calls[0] as unknown[])[1] as {
        headers: Record<string, string>;
      };
      expect(init.headers.Authorization).toBe('Key test-secret-key');
    });

    it('surfaces Khalti’s own error detail when initiation fails', async () => {
      mockFetch({ detail: 'Invalid token.' }, false);

      await expect(gatewayWith().initiate(contextFor(100))).rejects.toThrow(/Invalid token/);
    });

    it('rejects rather than throwing when unconfigured', async () => {
      await expect(
        gatewayWith({ KHALTI_SECRET_KEY: '' }).initiate(contextFor(100)),
      ).rejects.toThrow(/not configured/i);
    });
  });

  describe('verify', () => {
    it('converts the looked-up amount back from paisa', async () => {
      mockFetch({
        pidx: 'pidx-1',
        status: 'Completed',
        transaction_id: 'txn-1',
        total_amount: 150_000,
      });

      const result = await gatewayWith().verify({ pidx: 'pidx-1' });

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(result.amount).toBe(1500);
      expect(result.transactionId).toBe('txn-1');
    });

    it('calls the lookup endpoint rather than trusting the redirect', async () => {
      const fetchMock = mockFetch({ status: 'Completed', total_amount: 100 });

      await gatewayWith().verify({ pidx: 'pidx-1', status: 'Completed' });

      expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain(
        '/api/v2/epayment/lookup/',
      );
      expect(bodyOf(fetchMock).pidx).toBe('pidx-1');
    });

    it.each([
      ['Pending', PaymentStatus.PENDING],
      ['Initiated', PaymentStatus.PENDING],
      ['Refunded', PaymentStatus.REFUNDED],
      ['Expired', PaymentStatus.FAILED],
      ['User canceled', PaymentStatus.FAILED],
    ])('maps Khalti status %s to %s', async (khaltiStatus, expected) => {
      mockFetch({ status: khaltiStatus, total_amount: 100 });

      const result = await gatewayWith().verify({ pidx: 'pidx-1' });
      expect(result.status).toBe(expected);
    });

    it('rejects a callback with no pidx', async () => {
      mockFetch({});
      await expect(gatewayWith().verify({})).rejects.toThrow(/did not include a pidx/i);
    });
  });

  describe('refund', () => {
    it('sends the refund amount in paisa', async () => {
      const fetchMock = mockFetch({ status: 'refunded' });

      await gatewayWith().refund({
        payment: {
          id: 'p1',
          transactionId: 'txn-1',
          amount: 1500,
          currency: 'NPR',
          gatewayResponse: { pidx: 'pidx-1' },
        },
        amount: 1500,
        reason: 'Cancelled',
      });

      expect(bodyOf(fetchMock).amount).toBe(150_000);
      expect(bodyOf(fetchMock).pidx).toBe('pidx-1');
    });

    it('falls back to manual when no pidx was ever recorded', async () => {
      const result = await gatewayWith().refund({
        payment: {
          id: 'p1',
          transactionId: null,
          amount: 100,
          currency: 'NPR',
          gatewayResponse: null,
        },
        amount: 100,
        reason: 'Cancelled',
      });

      expect(result.isAutomated).toBe(false);
      expect(result.status).toBe('PENDING');
    });
  });
});
