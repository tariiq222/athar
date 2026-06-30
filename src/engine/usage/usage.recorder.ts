import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanDefinition, resolvePlan } from '../../config/billing-plans';
import { kindLabel } from '../../common/usage-labels';
import { startOfMonth } from '../../common/date';
import { latestSubscription } from '../../common/subscription';

export interface UsageInput {
  tenantId: string;
  kind: 'text' | 'image' | 'image_verify' | 'search';
  units: number;
  costUsd: number;
  subscriptionId?: string;
}

export interface ConsumeDecision {
  allowed: boolean;
  used: number;
  cap: number;
  reason?: string;
}

/**
 * Minimal Subscription shape we need to make cap / status decisions.
 * Kept inline (not imported from generated/prisma) so the recorder stays
 * decoupled from Prisma's exact row shape and easy to mock in tests.
 */
interface SubscriptionRow {
  id: string;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
}

/**
 * Single place that writes `UsageRecord` rows and answers "is this tenant
 * over its monthly unit cap?". The quota check is what lets the month-plan
 * distinguish `skipped_quota` from `provider_error` (Task 21).
 *
 * `canConsume` and `getCurrentPlan` extend the recorder with plan-aware
 * per-kind caps. The old `isOverQuota` helper was removed after its callers
 * migrated to `canConsume`.
 */
@Injectable()
export class UsageRecorder {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: UsageInput): Promise<void> {
    await this.prisma.usageRecord.create({
      data: {
        tenantId: input.tenantId,
        kind: input.kind,
        units: input.units,
        costUsd: input.costUsd,
        subscriptionId: input.subscriptionId,
      },
    });
  }

  /**
   * Resolve the active plan for a tenant. Reads the most recent Subscription
   * row; if none exists, falls back to the trial plan (defensive — a brand-new
   * tenant may not have a row yet).
   */
  async getCurrentPlan(tenantId: string): Promise<PlanDefinition> {
    const sub = await latestSubscription<{ plan: string }>(this.prisma, tenantId);
    if (!sub) return resolvePlan('trial');
    return resolvePlan(sub.plan);
  }

  /**
   * Decide whether a tenant may consume one more unit of the given kind,
   * driven by their `planDef`. Handles:
   *   - past_due / canceled: hard deny with Arabic reason
   *   - trialing with expired trial: lazy transition to past_due, then deny
   *   - per-kind cap comparison against this month's usage
   */
  async canConsume(
    tenantId: string,
    kind: 'text' | 'image' | 'image_verify' | 'search',
    planDef: PlanDefinition,
  ): Promise<ConsumeDecision> {
    const sub = await latestSubscription<SubscriptionRow>(this.prisma, tenantId);

    const status = sub?.status ?? 'trialing';

    if (status === 'past_due' || status === 'canceled') {
      const statusAr = status === 'past_due' ? 'متأخّر السداد' : 'ملغى';
      return {
        allowed: false,
        used: 0,
        cap: 0,
        reason: `الاشتراك ${statusAr}؛ جدّد للاستمرار.`,
      };
    }

    // Lazy trial-expiry: trial ended without payment. Flip to past_due
    // (a write) so the next reads see the correct status, then deny.
    if (status === 'trialing' && sub?.trialEndsAt && sub.trialEndsAt < new Date()) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'past_due' },
      });
      return {
        allowed: false,
        used: 0,
        cap: 0,
        reason: 'انتهت التجربة المجانية؛ يلزم الاشتراك.',
      };
    }

    const cap = (
      {
        text: planDef.monthlyDraftCap,
        image: planDef.monthlyImageCap,
        image_verify: planDef.monthlyImageCap,
        search: planDef.monthlySearchCap,
      } as const
    )[kind];

    const monthStart = startOfMonth();
    const agg = await this.prisma.usageRecord.aggregate({
      _sum: { units: true },
      where: { tenantId, kind, createdAt: { gte: monthStart } },
    });
    const used = agg._sum.units ?? 0;

    if (used >= cap) {
      const kindAr = kindLabel(kind);
      return {
        allowed: false,
        used,
        cap,
        reason: `بلغت سقف ${kindAr} الشهري (${used}/${cap}).`,
      };
    }

    return { allowed: true, used, cap };
  }
}
