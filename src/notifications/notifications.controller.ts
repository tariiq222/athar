import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import type { TenantContext } from '../tenant/tenant-context';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentTenant() ctx: TenantContext, @Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.list(ctx, unreadOnly === 'true');
  }

  @Patch(':id/read')
  markRead(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.notifications.markRead(ctx, id);
  }
}
