import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UsageInput {
  tenantId: string;
  kind: 'text' | 'image' | 'search';
  units: number;
  costUsd: number;
  subscriptionId?: string;
}

/**
 * Single place that writes `UsageRecord` rows and answers "is this tenant
 * over its monthly unit cap?". The quota check is what lets the month-plan
 * distinguish `skipped_quota` from `provider_error` (Task 21).
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

  async isOverQuota(tenantId: string): Promise<boolean> {
    const cap = Number(process.env.ENGINE_MONTHLY_UNIT_CAP ?? 100000);
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    const agg = await this.prisma.usageRecord.aggregate({
      _sum: { units: true },
      where: { tenantId, createdAt: { gte: startOfMonth } },
    });
    return (agg._sum.units ?? 0) >= cap;
  }
}