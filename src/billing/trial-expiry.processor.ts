import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

export const TRIAL_EXPIRY_QUEUE = 'trial-expiry';

@Injectable()
@Processor(TRIAL_EXPIRY_QUEUE)
export class TrialExpiryProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job): Promise<number> {
    return this.runOnce();
  }

  async runOnce(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.subscription.findMany({
      where: { status: 'trialing', trialEndsAt: { lt: now } },
      select: { id: true },
    });
    for (const s of expired) {
      await this.prisma.subscription.update({
        where: { id: s.id },
        data: { status: 'past_due' },
      });
    }
    return expired.length;
  }
}
