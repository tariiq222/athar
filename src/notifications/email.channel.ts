import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  NotificationChannel,
  NotificationChannelId,
  ReminderNotification,
  DeliveryResult,
} from './notification.types';

// Minimal transporter contract so we don't couple to nodemailer's concrete type in tests.
export interface MailTransporter {
  sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
}

export const MAIL_TRANSPORTER = Symbol('MAIL_TRANSPORTER');

@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly id: NotificationChannelId = 'email';

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly mailer: MailTransporter,
    private readonly prisma: PrismaService,
  ) {}

  async send(payload: ReminderNotification): Promise<DeliveryResult> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { tenantId: payload.tenantId },
      });
      if (!user?.email) {
        return { delivered: false, error: 'no recipient for tenant' };
      }
      await this.mailer.sendMail({
        to: user.email,
        subject: 'تذكير: بوستك جاهز للنشر',
        html: this.render(payload),
      });
      return { delivered: true };
    } catch (err) {
      return { delivered: false, error: (err as Error).message };
    }
  }

  private render(payload: ReminderNotification): string {
    const e = payload.export;
    const image = e.imageUrl
      ? `<p><a href="${e.imageUrl}">تنزيل الصورة</a></p>`
      : '';
    const escaped = e.formattedText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<!doctype html>
<html dir="rtl" lang="ar">
  <body style="font-family: Tahoma, Arial, sans-serif; text-align: right;">
    <h2>تذكير نشر</h2>
    <p>حان موعد نشر بوستك. النص جاهز للنسخ:</p>
    <pre style="white-space: pre-wrap; background:#f4f4f4; padding:12px;">${escaped}</pre>
    ${image}
    <p><a href="${e.deepLink}" style="display:inline-block;padding:10px 16px;background:#0a66c2;color:#fff;text-decoration:none;border-radius:6px;">افتح المنصة وانشر</a></p>
  </body>
</html>`;
  }
}
