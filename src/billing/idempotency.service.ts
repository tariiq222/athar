import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Sprint A — Task 6.1: webhook idempotency keyed by the upstream event id.
// Without this, a duplicate Moyasar delivery would create a second invoice
// (and the `Invoice.moyasarPaymentId` UNIQUE constraint would surface as
// a 500). Claiming is done by `webhookEvent.create` which throws P2002 on
// the PK collision — we map that to "already processed" so the controller
// can short-circuit.
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(
    eventId: string,
    type: string,
    tenantId: string | null,
    payload: unknown,
  ): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          id: eventId,
          type,
          tenantId: tenantId ?? null,
          payload: payload as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (err: unknown) {
      // Prisma P2002 = unique constraint violation on the primary key.
      // The event was already claimed by a previous delivery → treat as
      // "not first" so the caller can ack and skip.
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: unknown }).code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
  }
}
