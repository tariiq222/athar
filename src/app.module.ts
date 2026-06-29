import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { EngineModule } from './engine/engine.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { UserModule } from './user/user.module';
import { AccountProfileModule } from './accounts/account-profile.module';
import { BrandModule } from './brand/brand.module';
import { PostModule } from './posts/post.module';
import { OccasionModule } from './occasions/occasion.module';
import { CalendarModule } from './calendar/calendar.module';
import { NotificationModule } from './notifications/notifications.module';
import { PublishingModule } from './publishing/publishing.module';
import { BillingModule } from './billing/billing.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { buildValidationPipe } from './common/dto-validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    PrismaModule,
    HealthModule,
    EngineModule,
    AuthModule,
    TenantModule,
    UserModule,
    AccountProfileModule,
    BrandModule,
    PostModule,
    OccasionModule,
    CalendarModule,
    NotificationModule,
    PublishingModule,
    BillingModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: buildValidationPipe },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
