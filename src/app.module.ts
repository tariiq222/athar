import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { buildValidationPipe } from './common/dto-validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    EngineModule,
    AuthModule,
    TenantModule,
    UserModule,
    AccountProfileModule,
    BrandModule,
    PostModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: buildValidationPipe },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}