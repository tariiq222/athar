import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import type { TenantContext } from '../tenant/tenant-context';
import type { Platform } from '../config/platform-limits';
import { ExportService } from './export.service';
import { ReminderService } from './reminder.service';
import { MarkPublishedService } from './mark-published.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { MarkPublishedDto } from './dto/mark-published.dto';

@Controller()
@UseGuards(JwtAuthGuard, TenantGuard)
export class PublishingController {
  constructor(
    private readonly exportService: ExportService,
    private readonly reminderService: ReminderService,
    private readonly markPublishedService: MarkPublishedService,
  ) {}

  @Get('posts/:id/export')
  export(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Query('platform') platform?: Platform,
  ) {
    return this.exportService.buildPayload(ctx.tenantId, id, platform);
  }

  @Post('posts/:id/mark-published')
  markPublished(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: MarkPublishedDto,
  ) {
    return this.markPublishedService.markPublished(ctx.tenantId, id, dto.publishedAt);
  }

  @Post('reminders')
  createReminder(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateReminderDto) {
    return this.reminderService.create(ctx.tenantId, dto);
  }

  @Delete('reminders/:id')
  cancelReminder(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.reminderService.cancel(ctx.tenantId, id);
  }

  @Get('posts/:id/reminders')
  listReminders(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.reminderService.list(ctx.tenantId, id);
  }
}
