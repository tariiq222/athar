import { BillingController } from './billing.controller';
import { TenantContext } from '../tenant/tenant-context';
import { MoyasarWebhookEvent } from './billing.types';

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
    const config = {
      get: (k: string) =>
        ({ MOYASAR_WEBHOOK_SECRET: 'whsec_xxx' } as Record<string, string>)[k],
    } as any;
    const ctrl = new BillingController(billing, moyasar, config);
    return { ctrl, billing, moyasar, config };
  }

  const ctx: TenantContext = { tenantId: 't1', userId: 'u1' };

  it('subscribe delegates to billing.createSubscriptionIntent', async () => {
    const { ctrl, billing } = make();
    await ctrl.subscribe(ctx, { planCode: 'business', cycle: 'monthly' });
    expect(billing.createSubscriptionIntent).toHaveBeenCalledTimes(1);
    expect(billing.createSubscriptionIntent).toHaveBeenCalledWith(
      ctx,
      'business',
      'monthly',
    );
  });

  describe('webhook', () => {
    it('valid token delegates to billing.handleWebhookEvent', async () => {
      const { ctrl, billing } = make();
      const okReq = {
        body: {
          id: 'evt_1',
          type: 'payment_paid',
          created_at: '2026-06-29T00:00:00Z',
          secret_token: 'whsec_xxx',
          data: {
            id: 'pay_1',
            status: 'paid',
            amount: 59900,
            currency: 'SAR',
            source: { type: 'creditcard' },
            metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
          },
        } satisfies MoyasarWebhookEvent,
      };
      await ctrl.webhook(okReq as any);
      expect(billing.handleWebhookEvent).toHaveBeenCalledTimes(1);
      expect(billing.handleWebhookEvent).toHaveBeenCalledWith(
        okReq.body,
        { tenantId: 't1', userId: 'webhook' },
      );
    });

    it('invalid token throws 401 (webhookSignatureInvalid)', async () => {
      const { ctrl, billing } = make();
      const badReq = {
        body: {
          id: 'evt_1',
          type: 'payment_paid',
          created_at: '2026-06-29T00:00:00Z',
          secret_token: 'wrong',
          data: {
            id: 'pay_1',
            status: 'paid',
            amount: 59900,
            currency: 'SAR',
            source: { type: 'creditcard' },
            metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
          },
        } satisfies MoyasarWebhookEvent,
      };
      await expect(ctrl.webhook(badReq as any)).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
        status: 401,
      });
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('empty token throws 401', async () => {
      const { ctrl, billing } = make();
      const emptyReq = {
        body: {
          id: 'evt_1',
          type: 'payment_paid',
          created_at: '2026-06-29T00:00:00Z',
          secret_token: '',
          data: {
            id: 'pay_1',
            status: 'paid',
            amount: 59900,
            currency: 'SAR',
            source: { type: 'creditcard' },
            metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
          },
        } satisfies MoyasarWebhookEvent,
      };
      await expect(ctrl.webhook(emptyReq as any)).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('missing configured secret throws 401', async () => {
      const { ctrl, billing } = make({
        config: { get: () => undefined } as any,
      });
      const req = {
        body: {
          id: 'evt_1',
          type: 'payment_paid',
          created_at: '2026-06-29T00:00:00Z',
          secret_token: 'anything',
          data: {
            id: 'pay_1',
            status: 'paid',
            amount: 59900,
            currency: 'SAR',
            source: { type: 'creditcard' },
            metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
          },
        } satisfies MoyasarWebhookEvent,
      };
      await expect(ctrl.webhook(req as any)).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
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
    await ctrl.cancel(ctx, { confirm: true });
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