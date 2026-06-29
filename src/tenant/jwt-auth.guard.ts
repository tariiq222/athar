import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TokenService } from '../auth/token.service';
import { TenantContext } from './tenant-context';
import { unauthenticated } from '../common/errors/error-envelope';

interface AuthedRequest {
  headers: { authorization?: string };
  tenantContext?: TenantContext;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw unauthenticated();

    const token = header.slice('Bearer '.length).trim();
    const payload = await this.tokens.verifyAccess(token);
    request.tenantContext = { userId: payload.sub, tenantId: payload.tenantId };
    return true;
  }
}
