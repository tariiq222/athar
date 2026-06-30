import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TenantContext } from './tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { securityViolation, unauthenticated } from '../common/errors/error-envelope';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ tenantContext?: TenantContext }>();
    const tc = request.tenantContext;
    if (!tc?.tenantId) throw unauthenticated();
    if (tc.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: tc.userId },
        select: { tenantId: true },
      });
      if (!user || user.tenantId !== tc.tenantId) {
        throw securityViolation('TENANT_MISMATCH');
      }
    }
    return true;
  }
}
