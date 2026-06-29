import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  NotificationChannel,
  NotificationChannelId,
  ReminderNotification,
  DeliveryResult,
} from './notification.types';

@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly id: NotificationChannelId = 'in_app';

  constructor(private readonly prisma: PrismaService) {}

  async send(payload: ReminderNotification): Promise<DeliveryResult> {
    try {
      await this.prisma.notification.create({
        data: {
          tenantId: payload.tenantId,
          type: 'reminder',
          title: 'تذكير نشر: بوستك جاهز للنشر',
          body: `حان موعد نشر بوستك. النص جاهز قدّامك للنسخ، والصورة جاهزة للتنزيل — افتح المحرّر للتصدير والنشر.`,
          postId: payload.postId,
        },
      });
      return { delivered: true };
    } catch (err) {
      return { delivered: false, error: (err as Error).message };
    }
  }
}
