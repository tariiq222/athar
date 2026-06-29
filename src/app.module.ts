import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { EngineModule } from './engine/engine.module';
import { BrandModule } from './brand/brand.module';
import { buildValidationPipe } from './common/dto-validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    EngineModule,
    BrandModule,
  ],
  providers: [{ provide: APP_PIPE, useFactory: buildValidationPipe }],
})
export class AppModule {}
