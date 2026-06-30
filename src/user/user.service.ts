import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { confirmationRequired } from '../common/errors/error-envelope';
import { latestSubscription } from '../common/subscription';

// Selection that NEVER exposes secret columns.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  tenantId: true,
  createdAt: true,
} as const;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async me(ctx: TenantContext) {
    const user = await this.prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, email: true, name: true },
    });
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: ctx.tenantId },
      select: { id: true, name: true },
    });
    const subscription = await latestSubscription(this.prisma, ctx.tenantId, {
      select: { status: true, plan: true, trialEndsAt: true },
    });
    return { user, tenant, subscription };
  }

  async exportData(ctx: TenantContext) {
    const where = { tenantId: ctx.tenantId };
    const [tenant, users, brandProfiles, posts, accountProfiles, subscriptions] = await Promise.all(
      [
        this.prisma.tenant.findFirst({
          where: { id: ctx.tenantId },
          select: { id: true, name: true },
        }),
        this.prisma.user.findMany({ where, select: SAFE_USER_SELECT }),
        this.prisma.brandProfile.findMany({ where }),
        this.prisma.post.findMany({ where }),
        this.prisma.accountProfile.findMany({ where }),
        this.prisma.subscription.findMany({ where }),
      ],
    );

    return {
      exportedAt: new Date().toISOString(),
      tenant,
      users,
      brandProfiles,
      posts,
      accountProfiles,
      subscriptions,
    };
  }

  async softDelete(ctx: TenantContext, dto: { confirm: boolean }) {
    if (dto.confirm !== true) throw confirmationRequired();

    const retentionDays = Number(this.config.get<string>('PURGE_RETENTION_DAYS') ?? '30');
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

    // Immediate soft-delete: mark tenant + schedule purge.
    await this.prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { deletedAt: now, purgeAfter },
    });
    // Session invalidation: drop every refresh token in the tenant.
    await this.prisma.user.updateMany({
      where: { tenantId: ctx.tenantId },
      data: { refreshTokenHash: null, deletedAt: now },
    });

    return { status: 'scheduled_for_deletion' as const, purgeAfter: purgeAfter.toISOString() };
  }
}
