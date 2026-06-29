import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { NotificationModule } from '../notifications/notifications.module';
import { REMINDER_QUEUE } from './reminder.constants';
import { ExportFormatter } from './export-formatter.service';
import { DeepLinkBuilder } from './deep-link-builder.service';
import { ExportService } from './export.service';
import { ReminderService } from './reminder.service';
import { MarkPublishedService } from './mark-published.service';
import { ReminderProcessor } from './reminder.processor';
import { PublishingController } from './publishing.controller';

@Module({
  imports: [
    AuthModule, // provides TokenService used by JwtAuthGuard inside TenantModule
    TenantModule, // provides JwtAuthGuard, TenantGuard, CurrentTenant, TenantContext
    NotificationModule, // provides NotificationDispatcher (consumed by ReminderProcessor)
    BullModule.registerQueue({ name: REMINDER_QUEUE }),
  ],
  controllers: [PublishingController],
  providers: [
    ExportFormatter,
    DeepLinkBuilder,
    ExportService,
    ReminderService,
    MarkPublishedService,
    ReminderProcessor,
  ],
  exports: [ExportService],
})
export class PublishingModule {}
