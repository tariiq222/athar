import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ExportService } from './export.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { REMINDER_QUEUE } from './reminder.constants';
import type { NotificationChannelId } from './publishing.types';
import type { ReminderNotification } from '../notifications/notification.types';

interface ReminderJobData {
  reminderId: string;
  postId: string;
  tenantId: string;
  channel: NotificationChannelId;
}

@Processor(REMINDER_QUEUE)
export class ReminderProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exportService: ExportService,
    private readonly dispatcher: NotificationDispatcher,
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>): Promise<void> {
    const { reminderId, postId, tenantId, channel } = job.data;

    const reminder = await this.prisma.reminder.findUnique({ where: { id: reminderId } });
    // Idempotency: only a still-scheduled reminder is delivered (guards duplicate delivery).
    if (!reminder || reminder.status !== 'scheduled') return;

    let exportPayload;
    try {
      exportPayload = await this.exportService.buildPayload(tenantId, postId);
    } catch {
      // Post deleted / changed away from approved before maturity: drop quietly.
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'cancelled' },
      });
      return;
    }

    const notification: ReminderNotification = {
      tenantId,
      postId,
      export: exportPayload,
      remindAt: reminder.remindAt.toISOString(),
    };
    const result = await this.dispatcher.dispatch(channel, notification);
    await this.prisma.reminder.update({
      where: { id: reminderId },
      data: { status: result.delivered ? 'sent' : 'failed' },
    });
  }
}
