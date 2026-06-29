import { BillingService } from './billing.service';
import { BUSINESS_PLAN, TRIAL_PLAN } from '../config/billing-plans';

describe('BillingService', () => {
  function makeSvc(opts: any = {}) {
    const findFirstCalls: any[] = [];
    const subscriptionFindFirst = jest.fn(async (args: any) => {
      findFirstCalls.push(args);
      if (opts.findFirst) return opts.findFirst(args);
      return {
        id: 's1',
        plan: 'trial',
        status: 'trialing',
        trialEndsAt: new Date(Date.now() + 86400_000),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        tenantId: 't1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const updates: any[] = [];
    const subscriptionUpdate = jest.fn(async ({ where, data }: any) => {
      updates.push({ where, data });
      if (opts.update) return opts.update({ where, data });
      return { id: where.id, ...data };
    });

    const invoices: any[] = [];
    const invoiceCreate = jest.fn(async ({ data }: any) => {
      invoices.push(data);
      if (opts.createInvoice) return opts.createInvoice({ data });
      return { id: 'inv_1', ...data };
    });

    const tenants: any[] = [];
    const tenantFindFirst = jest.fn(async (args: any) => {
      tenants.push(args);
      if (opts.findTenant) return opts.findTenant(args);
      return { id: 't1', name: 'Acme' };
    });

    const txState = { subscriptionUpdate, invoiceCreate, tenantFindFirst };
    const txPrisma = {
      subscription: {
        findFirst: subscriptionFindFirst,
        update: subscriptionUpdate,
      },
      invoice: {
        findFirst: jest.fn(async (args: any) => {
          if (opts.invoiceFindFirst) return opts.invoiceFindFirst(args);
          return null;
        }),
        create: invoiceCreate,
      },
      tenant: { findFirst: tenantFindFirst },
    };
    const transaction = jest.fn(async (fn: any) => fn(txPrisma));

    const prisma = {
      subscription: {
        findFirst: subscriptionFindFirst,
        update: subscriptionUpdate,
        findMany: opts.subscriptionFindMany ?? jest.fn(async () => []),
      },
      invoice: {
        findFirst: opts.invoiceFindFirstMain ?? jest.fn(async () => null),
        create: invoiceCreate,
      },
      tenant: { findFirst: tenantFindFirst },
      usageRecord: {
        aggregate: opts.usageAggregate ?? jest.fn(async () => ({ _sum: { units: 0 } })),
      },
      $transaction: transaction,
    } as any;

    const moyasar = opts.moyasar ?? {
      createPaymentIntent: jest.fn(async () => ({
        id: 'pay_1',
        status: 'initiated',
        amount: 59900,
        currency: 'SAR',
        source: { type: 'creditcard', transaction_url: 'https://3ds.example' },
        metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
      })),
      fetchPayment: jest.fn(async () => ({
        id: 'pay_1',
        status: 'paid',
        amount: 59900,
        currency: 'SAR',
        source: { type: 'creditcard' },
        metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
      })),
    };

    const config = {
      get: (k: string) =>
        ({
          MOYASAR_SECRET_KEY: 'sk_test_x',
          MOYASAR_PUBLISHABLE_KEY: 'pk_test_x',
          BILLING_PUBLIC_URL: 'https://app.example.com',
          SELLER_NAME: 'أثر',
          INVOICE_NUMBER_PREFIX: 'INV',
        })[k],
    } as any;

    const svc = new BillingService(prisma, moyasar, config);

    return {
      svc,
      prisma,
      moyasar,
      transaction,
      updates,
      invoices,
      tenants,
      findFirstCalls,
      txState,
    };
  }

  // ---------------------------------------------------------------------
  describe('createSubscriptionIntent', () => {
    it('returns Moyasar init params with metadata + given_id + publishableKey (monthly)', async () => {
      const { svc, moyasar } = makeSvc();
      const out = await svc.createSubscriptionIntent(
        { tenantId: 't1', userId: 'u1' },
        'business',
        'monthly',
      );
      expect(moyasar.createPaymentIntent).toHaveBeenCalledTimes(1);
      const call = moyasar.createPaymentIntent.mock.calls[0][0];
      expect(call.amount).toBe(59900);
      expect(call.metadata.tenant_id).toBe('t1');
      expect(call.metadata.cycle).toBe('monthly');
      expect(call.metadata.plan_code).toBe('business');
      expect(call.callbackUrl).toContain('/billing/callback');
      expect(out.paymentId).toBe('pay_1');
      expect(out.amount).toBe(59900);
      expect(out.currency).toBe('SAR');
      expect(out.givenId).toMatch(/^sub:t1:/);
      expect(out.publishableKey).toBe('pk_test_x');
      expect(out.transactionUrl).toBe('https://3ds.example');
    });

    it('uses annual priceMinor when cycle=annual', async () => {
      const { svc, moyasar } = makeSvc();
      await svc.createSubscriptionIntent(
        { tenantId: 't1', userId: 'u1' },
        'business',
        'annual',
      );
      const call = moyasar.createPaymentIntent.mock.calls[0][0];
      expect(call.amount).toBe(BUSINESS_PLAN.annualPriceMinor);
    });
  });

  // ---------------------------------------------------------------------
  describe('verifyAndActivate — security contract (4 axes)', () => {
    it('on paid + matching metadata activates subscription and issues invoice', async () => {
      const { svc, updates, invoices } = makeSvc();
      const out = await svc.verifyAndActivate('pay_1', { tenantId: 't1', userId: 'u1' });
      expect(out.status).toBe('active');
      expect(out.subscriptionId).toBe('s1');
      // subscription updated to active + plan=business + future period end
      const activeUpdate = updates.find((u) => u.data.status === 'active');
      expect(activeUpdate).toBeDefined();
      expect(activeUpdate!.data.plan).toBe('business');
      expect(activeUpdate!.data.cancelAtPeriodEnd).toBe(false);
      expect(new Date(activeUpdate!.data.currentPeriodEnd).getTime()).toBeGreaterThan(
        Date.now(),
      );
      // exactly one invoice, tenant-scoped, totalMinor matches payment.amount
      expect(invoices).toHaveLength(1);
      expect(invoices[0].tenantId).toBe('t1');
      expect(invoices[0].subscriptionId).toBe('s1');
      expect(invoices[0].moyasarPaymentId).toBe('pay_1');
      expect(invoices[0].totalMinor).toBe(59900);
      expect(invoices[0].sellerName).toBe('أثر');
      expect(invoices[0].buyerName).toBe('Acme');
      expect(invoices[0].number).toMatch(/^INV-t1-000001$/);
    });

    it('rejects when status != paid', async () => {
      const { svc, invoices } = makeSvc({
        moyasar: {
          createPaymentIntent: jest.fn(),
          fetchPayment: jest.fn(async () => ({
            id: 'pay_1',
            status: 'failed',
            amount: 59900,
            currency: 'SAR',
            source: { type: 'creditcard', message: 'declined' },
            metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
          })),
        },
      });
      await expect(
        svc.verifyAndActivate('pay_1', { tenantId: 't1', userId: 'u1' }),
      ).rejects.toThrow(/فشلت عملية الدفع/);
      // No activation, no invoice
      expect(invoices).toHaveLength(0);
    });

    it('rejects when amount mismatch', async () => {
      const { svc, invoices } = makeSvc({
        moyasar: {
          createPaymentIntent: jest.fn(),
          fetchPayment: jest.fn(async () => ({
            id: 'pay_1',
            status: 'paid',
            amount: 1,
            currency: 'SAR',
            source: { type: 'creditcard' },
            metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
          })),
        },
      });
      await expect(
        svc.verifyAndActivate('pay_1', { tenantId: 't1', userId: 'u1' }),
      ).rejects.toThrow(/amount/i);
      expect(invoices).toHaveLength(0);
    });

    it('rejects when currency mismatch (not SAR)', async () => {
      const { svc, invoices } = makeSvc({
        moyasar: {
          createPaymentIntent: jest.fn(),
          fetchPayment: jest.fn(async () => ({
            id: 'pay_1',
            status: 'paid',
            amount: 59900,
            currency: 'USD' as any,
            source: { type: 'creditcard' },
            metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
          })),
        },
      });
      await expect(
        svc.verifyAndActivate('pay_1', { tenantId: 't1', userId: 'u1' }),
      ).rejects.toThrow(/currency/i);
      expect(invoices).toHaveLength(0);
    });

    it('rejects when tenant_id mismatch in metadata', async () => {
      const { svc, invoices } = makeSvc({
        moyasar: {
          createPaymentIntent: jest.fn(),
          fetchPayment: jest.fn(async () => ({
            id: 'pay_1',
            status: 'paid',
            amount: 59900,
            currency: 'SAR',
            source: { type: 'creditcard' },
            metadata: { tenant_id: 't_other', plan_code: 'business', cycle: 'monthly' },
          })),
        },
      });
      await expect(
        svc.verifyAndActivate('pay_1', { tenantId: 't1', userId: 'u1' }),
      ).rejects.toThrow(/tenant/i);
      expect(invoices).toHaveLength(0);
    });

    it('replay (already-active subscription with future period) is idempotent — no new invoice', async () => {
      const futureEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const { svc, invoices, updates } = makeSvc({
        findFirst: jest.fn(async () => ({
          id: 's1',
          plan: 'business',
          status: 'active',
          trialEndsAt: null,
          currentPeriodEnd: futureEnd,
          cancelAtPeriodEnd: false,
          tenantId: 't1',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });
      const out = await svc.verifyAndActivate('pay_1', { tenantId: 't1', userId: 'u1' });
      expect(out.status).toBe('active');
      expect(out.subscriptionId).toBe('s1');
      // No new update, no new invoice
      expect(updates).toHaveLength(0);
      expect(invoices).toHaveLength(0);
    });

    it('accepts annual amount when metadata.cycle=annual', async () => {
      const { svc, invoices } = makeSvc({
        moyasar: {
          createPaymentIntent: jest.fn(),
          fetchPayment: jest.fn(async () => ({
            id: 'pay_1',
            status: 'paid',
            amount: BUSINESS_PLAN.annualPriceMinor,
            currency: 'SAR',
            source: { type: 'creditcard' },
            metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'annual' },
          })),
        },
      });
      const out = await svc.verifyAndActivate('pay_1', { tenantId: 't1', userId: 'u1' });
      expect(out.status).toBe('active');
      expect(invoices[0].totalMinor).toBe(BUSINESS_PLAN.annualPriceMinor);
    });

    it('uses INV- prefix from INVOICE_NUMBER_PREFIX env', async () => {
      const make = makeSvc();
      // Override config for this single test
      (make.svc as any).config = {
        get: (k: string) =>
          ({
            SELLER_NAME: 'أثر',
            INVOICE_NUMBER_PREFIX: 'ATH',
          })[k],
      } as any;
      const out = await make.svc.verifyAndActivate('pay_1', { tenantId: 't1', userId: 'u1' });
      expect(out.status).toBe('active');
      expect(make.invoices[0].number).toMatch(/^ATH-t1-000001$/);
    });
  });

  // ---------------------------------------------------------------------
  describe('handleWebhookEvent', () => {
    it('payment_paid → activate (delegates to verify-and-activate path)', async () => {
      const { svc, invoices } = makeSvc();
      const event = {
        id: 'evt_1',
        type: 'payment_paid' as const,
        created_at: '2026-01-01',
        secret_token: 'x',
        data: {
          id: 'pay_1',
          status: 'paid' as const,
          amount: 59900,
          currency: 'SAR' as const,
          source: { type: 'creditcard' as const },
          metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
        },
      };
      const out = await svc.handleWebhookEvent(event, { tenantId: 't1', userId: 'webhook' });
      expect(out.status).toBe('active');
      expect(invoices).toHaveLength(1);
    });

    it('payment_failed transitions active subscription to past_due', async () => {
      const { svc, updates } = makeSvc({
        findFirst: jest.fn(async () => ({
          id: 's1',
          plan: 'business',
          status: 'active',
          trialEndsAt: null,
          currentPeriodEnd: new Date(Date.now() + 86400_000),
          cancelAtPeriodEnd: false,
          tenantId: 't1',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });
      const event = {
        id: 'evt_2',
        type: 'payment_failed' as const,
        created_at: '2026-01-01',
        secret_token: 'x',
        data: {
          id: 'pay_2',
          status: 'failed' as const,
          amount: 59900,
          currency: 'SAR' as const,
          source: { type: 'creditcard' as const, message: 'declined' },
          metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
        },
      };
      const out = await svc.handleWebhookEvent(event, { tenantId: 't1', userId: 'webhook' });
      expect(out.status).toBe('past_due');
      const pastDue = updates.find((u) => u.data.status === 'past_due');
      expect(pastDue).toBeDefined();
    });

    it('payment_failed leaves already-past_due subscription unchanged (no-op)', async () => {
      const updates: any[] = [];
      const { svc } = makeSvc({
        findFirst: jest.fn(async () => ({
          id: 's1',
          plan: 'business',
          status: 'past_due',
          trialEndsAt: null,
          currentPeriodEnd: new Date(Date.now() - 86400_000),
          cancelAtPeriodEnd: false,
          tenantId: 't1',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        update: jest.fn(async ({ where, data }: any) => {
          updates.push({ where, data });
          return { id: where.id, ...data };
        }),
      });
      const event = {
        id: 'evt_3',
        type: 'payment_failed' as const,
        created_at: '2026-01-01',
        secret_token: 'x',
        data: {
          id: 'pay_3',
          status: 'failed' as const,
          amount: 59900,
          currency: 'SAR' as const,
          source: { type: 'creditcard' as const, message: 'declined' },
          metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
        },
      };
      const out = await svc.handleWebhookEvent(event, { tenantId: 't1', userId: 'webhook' });
      expect(out.status).toBe('past_due');
      expect(updates).toHaveLength(0);
    });

    it('ignores unknown event types (refunded / invoice_*)', async () => {
      const { svc, updates } = makeSvc();
      const event = {
        id: 'evt_4',
        type: 'payment_refunded' as const,
        created_at: '2026-01-01',
        secret_token: 'x',
        data: {
          id: 'pay_4',
          status: 'refunded' as const,
          amount: 59900,
          currency: 'SAR' as const,
          source: { type: 'creditcard' as const },
          metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
        },
      };
      const out = await svc.handleWebhookEvent(event, { tenantId: 't1', userId: 'webhook' });
      expect(out.status).toBe('ignored');
      expect(updates).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  describe('cancel', () => {
    it('sets canceled and cancelAtPeriodEnd=true on the latest subscription', async () => {
      const updates: any[] = [];
      const { svc } = makeSvc({
        findFirst: jest.fn(async () => ({
          id: 's1',
          plan: 'business',
          status: 'active',
          trialEndsAt: null,
          currentPeriodEnd: new Date(Date.now() + 86400_000),
          cancelAtPeriodEnd: false,
          tenantId: 't1',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        update: jest.fn(async ({ where, data }: any) => {
          updates.push({ where, data });
          return { id: where.id, ...data };
        }),
      });
      const out = await svc.cancel({ tenantId: 't1', userId: 'u1' });
      expect(out.status).toBe('canceled');
      expect(updates).toHaveLength(1);
      expect(updates[0].data.status).toBe('canceled');
      expect(updates[0].data.cancelAtPeriodEnd).toBe(true);
    });

    it('throws when no subscription exists', async () => {
      const { svc } = makeSvc({ findFirst: jest.fn(async () => null) });
      await expect(
        svc.cancel({ tenantId: 't1', userId: 'u1' }),
      ).rejects.toThrow(/no subscription/i);
    });
  });

  // ---------------------------------------------------------------------
  describe('getSubscription', () => {
    it('returns status + plan + per-kind usage counts vs caps', async () => {
      const { svc } = makeSvc({
        findFirst: jest.fn(async () => ({
          id: 's1',
          plan: 'business',
          status: 'active',
          trialEndsAt: null,
          currentPeriodEnd: new Date(Date.now() + 86400_000),
          cancelAtPeriodEnd: false,
          tenantId: 't1',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        usageAggregate: jest.fn(async ({ where }: any) => {
          const map: Record<string, number> = { text: 12, image: 4, search: 23 };
          return { _sum: { units: map[where.kind] ?? 0 } };
        }),
      });
      const out = await svc.getSubscription({ tenantId: 't1', userId: 'u1' });
      expect(out.status).toBe('active');
      expect(out.planCode).toBe('business');
      expect(out.priceSar).toBe(599);
      expect(out.usage.drafts).toEqual({ used: 12, cap: BUSINESS_PLAN.monthlyDraftCap });
      expect(out.usage.images).toEqual({ used: 4, cap: BUSINESS_PLAN.monthlyImageCap });
      expect(out.usage.searches).toEqual({ used: 23, cap: BUSINESS_PLAN.monthlySearchCap });
    });

    it('returns trialing + trial plan when subscription missing', async () => {
      const { svc } = makeSvc({ findFirst: jest.fn(async () => null) });
      const out = await svc.getSubscription({ tenantId: 't1', userId: 'u1' });
      expect(out.status).toBe('trialing');
      expect(out.planCode).toBe('trial');
      expect(out.usage.drafts.cap).toBe(TRIAL_PLAN.monthlyDraftCap);
    });
  });

  // ---------------------------------------------------------------------
  describe('getInvoice — tenant isolation', () => {
    it('returns the invoice when it belongs to the tenant', async () => {
      const inv = {
        id: 'inv_1',
        tenantId: 't1',
        subscriptionId: 's1',
        moyasarPaymentId: 'pay_1',
        number: 'INV-t1-000001',
        issuedAt: new Date(),
        totalMinor: 59900,
        currency: 'SAR',
        sellerName: 'أثر',
        buyerName: 'Acme',
        status: 'issued',
      };
      const { svc } = makeSvc({ invoiceFindFirstMain: jest.fn(async () => inv) });
      const out = await svc.getInvoice({ tenantId: 't1', userId: 'u1' }, 'inv_1');
      expect(out.id).toBe('inv_1');
    });

    it('throws invoiceNotFound when invoice belongs to another tenant', async () => {
      const { svc, prisma } = makeSvc({ invoiceFindFirstMain: jest.fn(async () => null) });
      await expect(
        svc.getInvoice({ tenantId: 't1', userId: 'u1' }, 'inv_other'),
      ).rejects.toThrow(/الفاتورة غير موجودة/);
      // The WHERE includes tenantId — verify isolation at the query level
      const call = (prisma.invoice.findFirst as jest.Mock).mock.calls[0][0];
      expect(call.where.id).toBe('inv_other');
      expect(call.where.tenantId).toBe('t1');
    });
  });
});
