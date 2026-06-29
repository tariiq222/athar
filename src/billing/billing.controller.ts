import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { TenantContext } from '../tenant/tenant-context';
import { webhookSignatureInvalid } from '../common/errors/error-envelope';
import { BillingService } from './billing.service';
import { MoyasarClient } from './moyasar.client';
import { MoyasarWebhookEvent } from './billing.types';
import { SubscribeDto } from './dto/subscribe.dto';
import { verifyWebhookToken } from './webhook-signature';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly moyasar: MoyasarClient,
    private readonly config: ConfigService,
  ) {}

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async subscribe(
    @CurrentTenant() ctx: TenantContext,
    @Body() dto: SubscribeDto,
  ) {
    return this.billing.createSubscriptionIntent(ctx, dto.planCode, dto.cycle);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request) {
    const body = req.body as MoyasarWebhookEvent;
    const expected = this.config.get<string>('MOYASAR_WEBHOOK_SECRET') ?? '';
    if (!verifyWebhookToken(body.secret_token, expected)) {
      throw webhookSignatureInvalid();
    }
    // Re-fetch verifies status; idempotent on payment.id (BillingService.activateFromPayment).
    const ctx = {
      tenantId: body.data.metadata.tenant_id,
      userId: 'webhook',
    };
    return this.billing.handleWebhookEvent(body, ctx);
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async subscription(@CurrentTenant() ctx: TenantContext) {
    return this.billing.getSubscription(ctx);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @HttpCode(200)
  async cancel(@CurrentTenant() ctx: TenantContext) {
    return this.billing.cancel(ctx);
  }

  @Get('invoice/:id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async invoice(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
  ) {
    return this.billing.getInvoice(ctx, id);
  }
}
