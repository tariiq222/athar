import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { TenantContext } from '../tenant/tenant-context';
import { AppError } from '../common/errors/error-envelope';
import { CalendarService } from './calendar.service';
import { GetCalendarDto, MAX_CALENDAR_RANGE_DAYS } from './dto/get-calendar.dto';

@Controller('calendar')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  async get(
    @CurrentTenant() ctx: TenantContext,
    @Query() query: GetCalendarDto,
  ) {
    const days = this.daysBetween(query.from, query.to);
    if (days > MAX_CALENDAR_RANGE_DAYS) {
      throw new AppError(
        400,
        'RANGE_TOO_WIDE',
        `الفترة المطلوبة (${days} يوماً) تتجاوز الحد الأقصى (${MAX_CALENDAR_RANGE_DAYS} يوماً).`,
      );
    }
    const entries = await this.calendar.get(ctx.tenantId, query);
    return { entries };
  }

  private daysBetween(fromIso: string, toIso: string): number {
    const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1; // inclusive
  }
}
