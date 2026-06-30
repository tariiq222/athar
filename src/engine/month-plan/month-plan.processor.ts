import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { EngineError } from '../types';
import type { GenerationRequest, MonthPlanProgress } from '../types';
import { distributePlan } from './saudi-calendar';

export interface MonthPlanJobData {
  monthPlanId: string;
  tenantId: string;
  request: GenerationRequest;
  count: number;
  monthStartIso: string;
}

/**
 * The async month-plan worker body (NFR-2). Extracted from the BullMQ
 * Worker so it can be unit-tested without Redis.
 *
 * Error-table (the critical distinction):
 *   - skipped_quota  → mark skipped, NO retry, plan continues
 *   - provider_error → mark failed, plan continues (BullMQ retry handles
 *                      transient retries at the job level — a single
 *                      post failure never drops the plan)
 */
@Injectable()
export class MonthPlanProcessor {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly prisma: PrismaService,
  ) {}

  async process(
    data: MonthPlanJobData,
    updateProgress: (percent: number) => Promise<void>,
  ): Promise<MonthPlanProgress> {
    const slots = distributePlan(data.count, new Date(data.monthStartIso));
    const progress: MonthPlanProgress = {
      total: slots.length,
      completed: 0,
      failed: 0,
      skippedQuota: 0,
      status: 'running',
    };
    await this.persist(data.monthPlanId, progress);

    for (let i = 0; i < slots.length; i += 1) {
      try {
        await this.pipeline.generateOne(data.request, data.monthPlanId);
        progress.completed += 1;
      } catch (err) {
        if (err instanceof EngineError && err.kind === 'skipped_quota') {
          progress.skippedQuota += 1;
        } else {
          progress.failed += 1;
        }
      }
      await this.persist(data.monthPlanId, progress);
      await updateProgress(Math.round(((i + 1) / slots.length) * 100));
    }

    progress.status = 'done';
    await this.persist(data.monthPlanId, progress);
    return progress;
  }

  private async persist(monthPlanId: string, p: MonthPlanProgress): Promise<void> {
    await this.prisma.monthPlan.update({
      where: { id: monthPlanId },
      data: {
        completed: p.completed,
        failed: p.failed,
        skippedQuota: p.skippedQuota,
        status: p.status,
      },
    });
  }
}
