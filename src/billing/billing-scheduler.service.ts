import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TRIAL_EXPIRY_QUEUE } from './trial-expiry.processor';

/**
 * Schedules the trial-expiry daily job. The processor exists but nothing
 * ever enqueues a job on `trial-expiry` — this scheduler adds the repeat
 * rule so expired trials flip to past_due without depending on traffic.
 *
 * Idempotency guard: `jobId` is fixed, so a daily kick-off cannot double up
 * if BullMQ is restarted mid-tick. The runOnce() body is also idempotent
 * (it only updates rows whose status='trialing').
 */
@Injectable()
export class BillingSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(TRIAL_EXPIRY_QUEUE) private readonly trialExpiryQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.trialExpiryQueue.add(
      'trial-expiry-daily',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
        jobId: 'trial-expiry:daily',
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }
}
