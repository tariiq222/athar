import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { TenantContext } from '../tenant/tenant-context';
import { webhookSignatureInvalid } from '../common/errors/error-envelope';
import { TenantThrottlerGuard } from '../common/throttler';
import { Throttle } from '@nestjs/throttler';
import { BillingService, TenantCtx } from './billing.service';
import { MoyasarClient } from './moyasar.client';
import { MoyasarWebhookEvent } from './billing.types';
import { SubscribeDto } from './dto/subscribe.dto';
import { verifyMoyasarHmac } from './webhook-hmac';
import { IdempotencyService } from './idempotency.service';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly moyasar: MoyasarClient,
    private readonly config: ConfigService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async subscribe(@CurrentTenant() ctx: TenantContext, @Body() dto: SubscribeDto) {
    return this.billing.createSubscriptionIntent(ctx, dto.planCode, dto.cycle);
  }

  // Sprint A — Task 6.1: HMAC-signed webhook + idempotency. Replaces the old
  // `body.secret_token` constant-time check (anyone who reads the body can
  // forge that) with HMAC-SHA256 over the raw bytes Moyasar actually sent
  // (rawBody is wired in main.ts). Idempotency is keyed on `event.id` so a
  // duplicate delivery short-circuits to `{ idempotent: true }` instead of
  // creating a second invoice.
  @Post('webhook')
  @HttpCode(200)
  // Sprint A — Task 10.1: tight per-second cap on the webhook. Moyasar can
  // legitimately retry, so we DO NOT throttle aggressively (the 6th/sec
  // is the abuse ceiling, not the retry ceiling). Tenant-scoped tracker
  // so one noisy tenant can't choke webhook delivery for everyone else.
  @UseGuards(TenantThrottlerGuard)
  @Throttle({ short: { limit: 5, ttl: 1000 } })
  async webhook(
    @Req() req: RequestWithRawBody,
    @Body() body: MoyasarWebhookEvent,
    // The signature header carries `<unix_ts>.<sigHex>`. Spring's @Header
    // name is case-insensitive at the HTTP layer but we normalize to
    // 'signature' (Moyasar's documented header).
  ) {
    const raw = req.rawBody;
    if (!raw) {
      // Defensive: a misconfigured deployment without rawBody would silently
      // skip HMAC verification. Fail closed.
      throw webhookSignatureInvalid();
    }
    const rawText = raw.toString('utf8');
    const signature = (req.headers['signature'] as string | undefined) ?? '';
    const secret = this.config.get<string>('MOYASAR_WEBHOOK_SECRET') ?? '';
    if (!verifyMoyasarHmac(rawText, signature, secret)) {
      throw webhookSignatureInvalid();
    }

    const event = body;
    if (!event?.id) {
      // No event id → can't idempotency-check. Treat as invalid signature
      // (defensive: a forged body without an id is also a forgery).
      throw webhookSignatureInvalid();
    }

    const tenantId = event.data?.metadata?.tenant_id ?? null;
    const first = await this.idempotency.claim(event.id, event.type, tenantId, event);
    if (!first) {
      // Already processed in a previous delivery — ack with the idempotent
      // flag so Moyasar's retry logic sees a 2xx and stops.
      return { received: true, idempotent: true };
    }

    const ctx: TenantCtx = { tenantId: tenantId ?? '', userId: 'webhook' };
    try {
      const out = await this.billing.handleWebhookEvent(event, ctx);
      await this.idempotency.markProcessed(event.id);
      return { received: true, ...out };
    } catch (err) {
      // Don't mark processed on failure — let Moyasar retry. The claim row
      // stays in place so a future retry sees it as already-claimed, which
      // is acceptable: we'd rather skip a duplicate processing than re-run
      // and potentially create a second invoice.
      throw err;
    }
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
  async invoice(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.billing.getInvoice(ctx, id);
  }
}
