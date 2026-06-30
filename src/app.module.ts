import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
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
import { ObservabilityModule } from './observability/observability.module';
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
    // Sprint A — Task 13.1: structured logging via nestjs-pino.
    // Redacts credentials/tokens from request logs (authorization headers,
    // cookies, body password/refreshToken, and any *.apiKey/*.token field
    // deeper in the payload). Auto-logging emits one log per HTTP request.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.refreshToken',
          '*.apiKey',
          '*.token',
        ],
        autoLogging: true,
      },
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    // Sprint A — Task 10.1: throttler is NOT registered as a global APP_GUARD.
    // Each route opts in via @Throttle + @UseGuards (auth uses default
    // per-IP ThrottlerGuard; billing webhook uses TenantThrottlerGuard so
    // bursts from a single tenant/IP don't poison other tenants).
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 3 },
      { name: 'medium', ttl: 60_000, limit: 20 },
    ]),
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
    // Sprint A — Task 13.1: ObservabilityModule is global so the
    // /metrics controller and the default-metrics collector are wired up
    // exactly once regardless of which feature module imports them.
    ObservabilityModule,
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