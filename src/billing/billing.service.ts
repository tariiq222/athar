import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MoyasarClient } from './moyasar.client';
import { BUSINESS_PLAN, PlanCode, PlanDefinition, resolvePlan } from '../config/billing-plans';
import { MoyasarPayment, MoyasarWebhookEvent } from './billing.types';
import { invoiceNotFound, paymentFailed } from '../common/errors/error-envelope';

export interface TenantCtx {
  tenantId: string;
  userId: string;
}

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moyasar: MoyasarClient,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1) subscribe — build a Moyasar payment intent and return init params
  // ---------------------------------------------------------------------------
  async createSubscriptionIntent(
    ctx: TenantCtx,
    planCode: PlanCode,
    cycle: 'monthly' | 'annual',
  ) {
    const plan = resolvePlan(planCode);
    const priceMinor = cycle === 'annual' ? plan.annualPriceMinor : plan.priceMinor;
    const givenId = `sub:${ctx.tenantId}:${randomUUID()}`;
    const callbackUrl = `${this.config.get<string>('BILLING_PUBLIC_URL')}/billing/callback`;
    const metadata = { tenant_id: ctx.tenantId, plan_code: planCode, cycle };

    const payment = await this.moyasar.createPaymentIntent({
      amount: priceMinor,
      givenId,
      callbackUrl,
      metadata,
      description: `Athar subscription (${planCode})`,
    });

    return {
      paymentId: payment.id,
      givenId,
      amount: priceMinor,
      currency: 'SAR' as const,
      callbackUrl,
      publishableKey: this.config.get<string>('MOYASAR_PUBLISHABLE_KEY'),
      metadata,
      status: payment.status,
      transactionUrl: payment.source.transaction_url ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // 2) verify-and-activate — public entry; re-fetches the payment server-side
  //    and delegates to the strict 4-axis security check in activateFromPayment.
  // ---------------------------------------------------------------------------
  async verifyAndActivate(paymentId: string, ctx: TenantCtx) {
    const payment = await this.moyasar.fetchPayment(paymentId);
    return this.activateFromPayment(payment, ctx);
  }

  // ---------------------------------------------------------------------------
  // 3) handleWebhookEvent — dispatcher for Moyasar webhook events.
  //    Always re-fetches (webhook payload is never trusted for status).
  // ---------------------------------------------------------------------------
  async handleWebhookEvent(event: MoyasarWebhookEvent, ctx: TenantCtx) {
    const payment = await this.moyasar.fetchPayment(event.data.id);

    if (event.type === 'payment_paid') {
      return this.activateFromPayment(payment, ctx);
    }

    if (event.type === 'payment_failed') {
      const sub = await this.prisma.subscription.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      if (sub && (sub.status === 'trialing' || sub.status === 'active')) {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'past_due' },
        });
      }
      return { status: 'past_due' as const };
    }

    // payment_refunded / invoice_paid / invoice_expired — out of scope for V1.
    return { status: 'ignored' as const };
  }

  // ---------------------------------------------------------------------------
  // Private: 4-axis security contract — the heart of the billing flow.
  // Every activation MUST verify these four fields against server-side truth.
  // ANY failure → no activation, no invoice, throw.
  // ---------------------------------------------------------------------------
  private async activateFromPayment(payment: MoyasarPayment, ctx: TenantCtx) {
    // Axis 1: status must be 'paid'
    if (payment.status !== 'paid') {
      throw paymentFailed(payment.source.message ?? 'not paid');
    }

    // Axis 2: amount must match expected (monthly vs annual)
    const cycle: 'monthly' | 'annual' =
      payment.metadata.cycle === 'annual' ? 'annual' : 'monthly';
    const expected =
      cycle === 'annual' ? BUSINESS_PLAN.annualPriceMinor : BUSINESS_PLAN.priceMinor;
    if (payment.amount !== expected) {
      throw new Error(
        `amount mismatch: got ${payment.amount}, expected ${expected}`,
      );
    }

    // Axis 3: currency must be SAR
    if (payment.currency !== 'SAR') {
      throw new Error(`currency mismatch: ${payment.currency}`);
    }

    // Axis 4: tenant_id in metadata MUST equal ctx.tenantId
    if (payment.metadata.tenant_id !== ctx.tenantId) {
      throw new Error(
        `tenant mismatch: got ${payment.metadata.tenant_id}, expected ${ctx.tenantId}`,
      );
    }

    // Atomic: subscription update + invoice creation. Idempotent on replay.
    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub) throw new Error('no subscription');

      // Replay guard — already active with a future period end → return idempotent.
      if (
        sub.status === 'active' &&
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd > new Date()
      ) {
        return { status: 'active' as const, subscriptionId: sub.id };
      }

      const periodEnd = new Date(Date.now() + PERIOD_MS);
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'active',
          plan: 'business',
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      });

      const invoiceNumber = await this.nextInvoiceNumber(tx, ctx.tenantId);
      const tenant = await tx.tenant.findFirst({
        where: { id: ctx.tenantId },
        select: { name: true },
      });
      await tx.invoice.create({
        data: {
          tenantId: ctx.tenantId,
          subscriptionId: sub.id,
          moyasarPaymentId: payment.id,
          number: invoiceNumber,
          totalMinor: payment.amount,
          sellerName: this.config.get<string>('SELLER_NAME') ?? 'أثر',
          buyerName: tenant?.name ?? 'Customer',
        },
      });

      return { status: 'active' as const, subscriptionId: updated.id };
    });
  }

  // ---------------------------------------------------------------------------
  // Private: sequential per-tenant invoice number. Format: PREFIX-<tenantTail>-000001.
  // The `@@unique([tenantId, number])` constraint guarantees no collision.
  // ---------------------------------------------------------------------------
  private async nextInvoiceNumber(
    tx: { invoice: { findFirst: (args: any) => Promise<{ number: string } | null> } },
    tenantId: string,
  ): Promise<string> {
    const prefix = this.config.get<string>('INVOICE_NUMBER_PREFIX') ?? 'INV';
    const last = await tx.invoice.findFirst({
      where: { tenantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? Number(last.number.split('-').pop()) + 1 : 1;
    return `${prefix}-${tenantId.slice(-6)}-${String(seq).padStart(6, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // 4) cancel — flag the latest subscription as canceled + cancelAtPeriodEnd.
  // ---------------------------------------------------------------------------
  async cancel(ctx: TenantCtx) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) throw new Error('no subscription');
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'canceled', cancelAtPeriodEnd: true },
    });
    return { status: updated.status, currentPeriodEnd: updated.currentPeriodEnd };
  }

  // ---------------------------------------------------------------------------
  // 5) getSubscription — status + plan + per-kind usage counts vs caps.
  // ---------------------------------------------------------------------------
  async getSubscription(ctx: TenantCtx) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const plan: PlanDefinition = resolvePlan(sub?.plan ?? 'trial');
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    const [drafts, images, searches] = await Promise.all([
      this.prisma.usageRecord.aggregate({
        _sum: { units: true },
        where: { tenantId: ctx.tenantId, kind: 'text', createdAt: { gte: startOfMonth } },
      }),
      this.prisma.usageRecord.aggregate({
        _sum: { units: true },
        where: { tenantId: ctx.tenantId, kind: 'image', createdAt: { gte: startOfMonth } },
      }),
      this.prisma.usageRecord.aggregate({
        _sum: { units: true },
        where: { tenantId: ctx.tenantId, kind: 'search', createdAt: { gte: startOfMonth } },
      }),
    ]);
    return {
      status: sub?.status ?? 'trialing',
      planCode: plan.code,
      priceSar: plan.priceSar,
      cycle: 'monthly' as const,
      trialEndsAt: sub?.trialEndsAt ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      usage: {
        drafts: { used: drafts._sum.units ?? 0, cap: plan.monthlyDraftCap },
        images: { used: images._sum.units ?? 0, cap: plan.monthlyImageCap },
        searches: { used: searches._sum.units ?? 0, cap: plan.monthlySearchCap },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 6) getInvoice — tenant-isolated; throws invoiceNotFound for other tenants.
  // ---------------------------------------------------------------------------
  async getInvoice(ctx: TenantCtx, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: ctx.tenantId },
    });
    if (!inv) throw invoiceNotFound();
    return inv;
  }
}