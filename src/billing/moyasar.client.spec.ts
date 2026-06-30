import { MoyasarClient } from './moyasar.client';

describe('MoyasarClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('createPaymentIntent POSTs to /v1/payments with Basic Auth and given_id', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          id: 'pay_1',
          status: 'initiated',
          amount: 59900,
          currency: 'SAR',
          source: { type: 'creditcard', transaction_url: 'https://3ds' },
          metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }) as any;

    const client = new MoyasarClient({
      secretKey: 'sk_test_x',
      baseUrl: 'https://api.moyasar.com/v1',
    });
    const out = await client.createPaymentIntent({
      amount: 59900,
      givenId: 'uuid-1',
      callbackUrl: 'https://app/billing/callback',
      metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
      description: 'Athar subscription',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.moyasar.com/v1/payments');
    expect(calls[0].init.headers.Authorization).toBe(
      'Basic ' + Buffer.from('sk_test_x:').toString('base64'),
    );
    expect(JSON.parse(calls[0].init.body).given_id).toBe('uuid-1');
    expect(out.id).toBe('pay_1');
  });

  it('fetchPayment GETs /v1/payments/:id and parses', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'pay_1',
            status: 'paid',
            amount: 59900,
            currency: 'SAR',
            source: { type: 'creditcard' },
            metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    ) as any;
    const client = new MoyasarClient({
      secretKey: 'sk_test_x',
      baseUrl: 'https://api.moyasar.com/v1',
    });
    const out = await client.fetchPayment('pay_1');
    expect(out.status).toBe('paid');
  });

  it('throws on non-2xx response as a typed 502 PAYMENT_GATEWAY_ERROR (does not echo the body)', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ message: 'invalid amount' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        }),
    ) as any;
    const client = new MoyasarClient({
      secretKey: 'sk_test_x',
      baseUrl: 'https://api.moyasar.com/v1',
    });
    await expect(client.fetchPayment('bad')).rejects.toMatchObject({
      code: 'PAYMENT_GATEWAY_ERROR',
      status: 502,
    });
    // Provider's internal message MUST NOT leak to clients (it can include
    // account-internal context). The Arabic envelope is what callers see.
    await expect(client.fetchPayment('bad')).rejects.not.toThrow(/invalid amount/);
  });
});
