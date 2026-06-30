import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MonthPlanProcessor, MonthPlanJobData } from './month-plan.processor';
import type { GenerationRequest, MonthPlanProgress } from '../types';

const QUEUE_NAME = 'month-plan';

/**
 * Creates MonthPlan rows, enqueues BullMQ jobs on the `month-plan`
 * queue, and exposes progress read-back from the DB.
 *
 * On boot (OnModuleInit) registers a Worker that delegates each job to
 * MonthPlanProcessor.process, wiring `job.updateProgress` to the
 * processor's progress callback.
 *
 * `attempts: 1` is intentional: per-post retry is handled inside the
 * processor (with the skipped_quota vs provider_error distinction); the
 * whole plan is not retried.
 */
@Injectable()
export class MonthPlanService implements OnModuleInit {
  private readonly queue: Queue;
  private readonly connection: { url: string };

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: MonthPlanProcessor,
    config: ConfigService,
  ) {
    this.connection = { url: config.get<string>('REDIS_URL')! };
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
  }

  onModuleInit(): void {
    new Worker<MonthPlanJobData>(
      QUEUE_NAME,
      async (job: Job<MonthPlanJobData>) =>
        this.processor.process(job.data, async (p) => {
          await job.updateProgress(p);
        }),
      {
        connection: this.connection,
        settings: { backoffStrategy: () => 5000 },
      },
    );
  }

  async enqueue(args: {
    tenantId: string;
    request: GenerationRequest;
    count: number;
    monthStartIso: string;
  }): Promise<{ monthPlanId: string }> {
    const plan = await this.prisma.monthPlan.create({
      data: { tenantId: args.tenantId, total: args.count, status: 'queued' },
    });
    await this.queue.add(
      'generate',
      {
        monthPlanId: plan.id,
        tenantId: args.tenantId,
        request: args.request,
        count: args.count,
        monthStartIso: args.monthStartIso,
      } satisfies MonthPlanJobData,
      { attempts: 1 },
    );
    return { monthPlanId: plan.id };
  }

  async getProgress(
    tenantId: string,
    monthPlanId: string,
  ): Promise<MonthPlanProgress> {
    // Scope by tenantId so one tenant cannot read another tenant's plan
    // progress by guessing a monthPlanId. findUniqueOrThrow only accepts
    // unique fields, so findFirstOrThrow adds the tenantId predicate while
    // preserving throw-on-missing.
    const p = await this.prisma.monthPlan.findFirstOrThrow({
      where: { id: monthPlanId, tenantId },
    });
    return {
      total: p.total,
      completed: p.completed,
      failed: p.failed,
      skippedQuota: p.skippedQuota,
      status: p.status as MonthPlanProgress['status'],
    };
  }
}