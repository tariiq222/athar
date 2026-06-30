import { BillingController } from './billing.controller';
import { TenantContext } from '../tenant/tenant-context';
import { MoyasarWebhookEvent } from './billing.types';
import { signMoyasarHmac } from './webhook-hmac';

const SECRET = 'whsec_xxx';

function buildBody(overrides: Partial<MoyasarWebhookEvent> = {}): MoyasarWebhookEvent {
  return {
    id: 'evt_1',
    type: 'payment_paid',
    created_at: '2026-06-29T00:00:00Z',
    ...overrides,
    data: {
      id: 'pay_1',
      status: 'paid',
      amount: 59900,
      currency: 'SAR',
      source: { type: 'creditcard' },
      metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
      ...(overrides.data ?? {}),
    },
  } as MoyasarWebhookEvent;
}

function sign(body: MoyasarWebhookEvent, ts?: number): string {
  return signMoyasarHmac(JSON.stringify(body), SECRET, ts);
}

describe('BillingController', () => {
  function make(overrides: any = {}) {
    const billing =
      overrides.billing ??
      ({
        createSubscriptionIntent: jest.fn(async () => ({
          paymentId: 'p',
          givenId: 'g',
          amount: 59900,
          currency: 'SAR',
          callbackUrl: 'cb',
          publishableKey: 'pk',
          metadata: {},
          status: 'initiated',
          transactionUrl: null,
        })),
        handleWebhookEvent: jest.fn(async () => ({ status: 'active' })),
        getSubscription: jest.fn(async () => ({ status: 'active' })),
        cancel: jest.fn(async () => ({ status: 'canceled' })),
        getInvoice: jest.fn(async () => ({ id: 'inv_1' })),
      } as any);
    const moyasar =
      overrides.moyasar ??
      ({
        createPaymentIntent: jest.fn(),
        fetchPayment: jest.fn(),
      } as any);
    const config =
      overrides.config ??
      ({
        get: (k: string) => (({ MOYASAR_WEBHOOK_SECRET: SECRET }) as Record<string, string>)[k],
      } as any);
    const idempotency = overrides.idempotency ?? {
      claim: jest.fn(async () => true),
      markProcessed: jest.fn(async () => undefined),
    };
    const ctrl = new BillingController(billing, moyasar, config, idempotency as any);
    return { ctrl, billing, moyasar, config, idempotency };
  }

  const ctx: TenantContext = { tenantId: 't1', userId: 'u1' };

  it('subscribe delegates to billing.createSubscriptionIntent', async () => {
    const { ctrl, billing } = make();
    await ctrl.subscribe(ctx, { planCode: 'business', cycle: 'monthly' });
    expect(billing.createSubscriptionIntent).toHaveBeenCalledTimes(1);
    expect(billing.createSubscriptionIntent).toHaveBeenCalledWith(ctx, 'business', 'monthly');
  });

  describe('webhook (HMAC + idempotency)', () => {
    it('valid HMAC signature delegates to billing.handleWebhookEvent', async () => {
      const { ctrl, billing } = make();
      const body = buildBody();
      const req = {
        rawBody: Buffer.from(JSON.stringify(body)),
        headers: { signature: sign(body) },
      };
      await ctrl.webhook(req as any, body);
      expect(billing.handleWebhookEvent).toHaveBeenCalledTimes(1);
      expect(billing.handleWebhookEvent).toHaveBeenCalledWith(body, {
        tenantId: 't1',
        userId: 'webhook',
      });
    });

    it('bad HMAC signature throws 401 WEBHOOK_SIGNATURE_INVALID', async () => {
      const { ctrl, billing } = make();
      const body = buildBody();
      const req = {
        rawBody: Buffer.from(JSON.stringify(body)),
        headers: { signature: '1700000000.deadbeef' },
      };
      await expect(ctrl.webhook(req as any, body)).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
        status: 401,
      });
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('missing rawBody throws 401 (defensive — without rawBody the HMAC cannot be verified)', async () => {
      const { ctrl, billing } = make();
      const body = buildBody();
      const req = { headers: { signature: 'whatever' } };
      await expect(ctrl.webhook(req as any, body)).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('missing signature header throws 401', async () => {
      const { ctrl, billing } = make();
      const body = buildBody();
      const req = { rawBody: Buffer.from(JSON.stringify(body)), headers: {} };
      await expect(ctrl.webhook(req as any, body)).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('missing configured secret throws 401', async () => {
      const { ctrl, billing } = make({ config: { get: () => undefined } as any });
      const body = buildBody();
      const req = {
        rawBody: Buffer.from(JSON.stringify(body)),
        headers: { signature: sign(body) },
      };
      await expect(ctrl.webhook(req as any, body)).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('tampered body (HMAC computed over different bytes) throws 401', async () => {
      const { ctrl, billing } = make();
      const sentBody = buildBody();
      // HMAC verifies against rawBody. Mutate rawBody after signing to simulate
      // a tamper in transit — the signature covers the original bytes, so
      // verification fails.
      const tampered = Buffer.from(JSON.stringify({ ...sentBody, type: 'payment_failed' }));
      const tamperedReq = {
        rawBody: tampered,
        headers: { signature: sign(sentBody) },
      };
      await expect(
        ctrl.webhook(tamperedReq as any, buildBody({ id: 'evt_evil' })),
      ).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('idempotency replay: second delivery with same event id returns idempotent flag, does NOT call billing again', async () => {
      const idempotency = {
        claim: jest.fn(async () => false), // already claimed
        markProcessed: jest.fn(async () => undefined),
      };
      const { ctrl, billing } = make({ idempotency });
      const body = buildBody();
      const req = {
        rawBody: Buffer.from(JSON.stringify(body)),
        headers: { signature: sign(body) },
      };
      const out = await ctrl.webhook(req as any, body);
      expect(out).toEqual({ received: true, idempotent: true });
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
      expect(idempotency.markProcessed).not.toHaveBeenCalled();
    });

    it('happy path: first delivery marks the event processed after billing succeeds', async () => {
      const idempotency = {
        claim: jest.fn(async () => true),
        markProcessed: jest.fn(async () => undefined),
      };
      const { ctrl } = make({ idempotency });
      const body = buildBody();
      const req = {
        rawBody: Buffer.from(JSON.stringify(body)),
        headers: { signature: sign(body) },
      };
      const out = await ctrl.webhook(req as any, body);
      expect(out).toEqual({ received: true, status: 'active' });
      expect(idempotency.markProcessed).toHaveBeenCalledWith('evt_1');
    });
  });

  it('subscription delegates to billing.getSubscription', async () => {
    const { ctrl, billing } = make();
    await ctrl.subscription(ctx);
    expect(billing.getSubscription).toHaveBeenCalledTimes(1);
    expect(billing.getSubscription).toHaveBeenCalledWith(ctx);
  });

  it('cancel delegates to billing.cancel', async () => {
    const { ctrl, billing } = make();
    await ctrl.cancel(ctx);
    expect(billing.cancel).toHaveBeenCalledTimes(1);
    expect(billing.cancel).toHaveBeenCalledWith(ctx);
  });

  it('invoice delegates to billing.getInvoice with id', async () => {
    const { ctrl, billing } = make();
    await ctrl.invoice(ctx, 'inv_1');
    expect(billing.getInvoice).toHaveBeenCalledTimes(1);
    expect(billing.getInvoice).toHaveBeenCalledWith(ctx, 'inv_1');
  });
});
