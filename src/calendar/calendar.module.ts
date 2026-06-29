import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { OccasionModule } from '../occasions/occasion.module';
import { PostModule } from '../posts/post.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, TenantModule, OccasionModule, PostModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
