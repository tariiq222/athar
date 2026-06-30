import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { MUTATION_METHODS } from '../common/http-methods';

// Paths that legitimately receive state-changing requests from non-browser callers
// and therefore cannot carry a browser Origin header:
//  - the cookie-issuing auth endpoints (a client mints the session/csrf cookie here),
//  - the Moyasar webhook (server-to-server, authenticated by HMAC signature, not Origin).
const ORIGIN_EXEMPT_PATHS = new Set<string>([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/csrf',
  '/api/v1/billing/webhook',
]);

@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowList: string[];

  constructor() {
    this.allowList = (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      headers: Record<string, string>;
    }>();
    if (!MUTATION_METHODS.has(req.method)) return true;
    if (ORIGIN_EXEMPT_PATHS.has(req.path)) return true;

    // Bearer-token requests are not CSRF-vulnerable: an attacker page cannot read
    // the token nor force the browser to attach an Authorization header. Origin
    // validation only protects ambient-credential (cookie) flows.
    const authorization = req.headers['authorization'];
    if (authorization && authorization.startsWith('Bearer ')) return true;

    const origin = req.headers['origin'];
    if (!origin) throw new ForbiddenException('missing Origin header on state-changing request');
    if (!this.allowList.includes(origin)) {
      throw new ForbiddenException(`Origin '${origin}' not in allow-list`);
    }
    return true;
  }
}
