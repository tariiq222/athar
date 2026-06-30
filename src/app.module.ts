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
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { buildValidationPipe } from './common/dto-validation';
import { validateConfig } from './config/config-validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateConfig,
    }),
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
  // Sprint A — Task 9.1: single APP_PIPE + single APP_FILTER (was previously
  // duplicated by `useGlobalPipes`/`useGlobalFilters` in main.ts — call N
  // would stack N copies of the filter/pipe on the same request chain).
  providers: [
    { provide: APP_PIPE, useFactory: buildValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
