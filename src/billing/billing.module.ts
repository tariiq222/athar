import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { EngineModule } from '../engine/engine.module';
import { TenantModule } from '../tenant/tenant.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { MoyasarClient } from './moyasar.client';
import { IdempotencyService } from './idempotency.service';
import {
  TRIAL_EXPIRY_QUEUE,
  TrialExpiryProcessor,
} from './trial-expiry.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: TRIAL_EXPIRY_QUEUE }),
    AuthModule,
    EngineModule,
    TenantModule,
  ],
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: MoyasarClient,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) =>
        MoyasarClient.fromSecret(cfg.get<string>('MOYASAR_SECRET_KEY') ?? ''),
    },
    IdempotencyService,
    TrialExpiryProcessor,
    BillingSchedulerService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
