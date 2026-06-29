import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

export interface TenantContext {
  userId: string;
  tenantId: string;
}

// Phase-3 stub: real JWT validation is added in Phase 3. Here it is a pass-through.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

// Phase-3 stub: derives the tenant from headers and attaches it to the request.
// Phase 3 replaces the body to read it from the verified JWT. Public shape unchanged.
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const tenantId = req.headers['x-tenant-id'];
    const userId = req.headers['x-user-id'];
    if (!tenantId || !userId) {
      throw new UnauthorizedException('missing tenant context');
    }
    req.tenant = { tenantId, userId } as TenantContext;
    return true;
  }
}
