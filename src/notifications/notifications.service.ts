import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant-context';
import { notFound } from '../common/errors/error-envelope';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: TenantContext, unreadOnly?: boolean) {
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      OR: [{ userId: ctx.userId }, { userId: null }],
    };
    if (unreadOnly) where.readAt = null;
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(ctx: TenantContext, id: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw notFound();
    if (existing.readAt) return existing; // idempotent
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
