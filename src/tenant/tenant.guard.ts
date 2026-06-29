import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TenantContext } from './tenant-context';
import { unauthenticated } from '../common/errors/error-envelope';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ tenantContext?: TenantContext }>();
    if (!request.tenantContext?.tenantId) throw unauthenticated();
    return true;
  }
}
