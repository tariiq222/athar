import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { REMINDER_QUEUE } from './reminder.constants';
import type { MarkPublishedResult } from './publishing.types';
import { invalidStatusTransition, notFound } from '../common/errors/error-envelope';
import { PostStateMachine } from '../posts/post-state-machine';

@Injectable()
export class MarkPublishedService {
  private readonly stateMachine = new PostStateMachine();

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(REMINDER_QUEUE) private readonly queue: Queue,
  ) {}

  async markPublished(
    tenantId: string,
    postId: string,
    publishedAt?: string,
  ): Promise<MarkPublishedResult> {
    const post = await this.prisma.post.findFirst({ where: { id: postId, tenantId } });
    if (!post) throw notFound();
    if (post.status !== 'approved') throw invalidStatusTransition(post.status);

    // Cross-check via the state machine so the table stays the single source of truth.
    this.stateMachine.assertTransition(post.status, {
      from: 'approved',
      to: 'published',
    });

    const when = publishedAt ? new Date(publishedAt) : new Date();
    await this.prisma.post.update({
      where: { id: postId },
      data: { status: 'published', publishedAt: when },
    });

    // No reminders needed after publishing: cancel pending and dequeue their jobs.
    const pending = await this.prisma.reminder.findMany({
      where: { postId, tenantId, status: 'scheduled' },
    });
    await this.prisma.reminder.updateMany({
      where: { postId, tenantId, status: 'scheduled' },
      data: { status: 'cancelled' },
    });
    for (const r of pending) {
      await this.queue.remove(r.id);
    }

    return { postId, status: 'published', publishedAt: when.toISOString() };
  }
}
