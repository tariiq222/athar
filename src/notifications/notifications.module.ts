import { Module } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { InAppChannel } from './in-app.channel';
import { EmailChannel, MAIL_TRANSPORTER, type MailTransporter } from './email.channel';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './notification.types';

@Module({
  imports: [AuthModule, TenantModule], // guards (JwtAuthGuard via TokenService in AuthModule)
  controllers: [NotificationsController],
  providers: [
    InAppChannel,
    EmailChannel,
    NotificationDispatcher,
    NotificationsService,
    {
      provide: MAIL_TRANSPORTER,
      useFactory: (): MailTransporter =>
        nodemailer.createTransport({
          host: process.env.SMTP_HOST ?? 'localhost',
          port: Number(process.env.SMTP_PORT ?? 1025),
          secure: false,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        }) as unknown as MailTransporter,
    },
    {
      // The single registration point for channels. Add WhatsappChannel here later.
      provide: NOTIFICATION_CHANNELS,
      useFactory: (inApp: InAppChannel, email: EmailChannel): NotificationChannel[] => [
        inApp,
        email,
      ],
      inject: [InAppChannel, EmailChannel],
    },
  ],
  exports: [NotificationDispatcher],
})
export class NotificationModule {}
