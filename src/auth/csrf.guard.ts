import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MUTATION_METHODS } from '../common/http-methods';

// These endpoints already issue cookies via the response — they cannot also
// require a CSRF token (chicken-and-egg). Skipping the check on them is the
// standard exception for double-submit.
const CSRF_EXEMPT_PATHS = new Set<string>([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/csrf',
  // Moyasar webhook is server-to-server and authenticated by HMAC signature,
  // not by an ambient session cookie — the double-submit check does not apply.
  '/api/v1/billing/webhook',
]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      headers: Record<string, string>;
      cookies: Record<string, string>;
    }>();
    if (!MUTATION_METHODS.has(req.method)) return true;
    if (CSRF_EXEMPT_PATHS.has(req.path)) return true;

    // Bearer-token requests carry no ambient cookie credential, so they cannot be
    // forged cross-site. CSRF double-submit only guards the cookie-session flow.
    const authorization = req.headers['authorization'];
    if (authorization && authorization.startsWith('Bearer ')) return true;

    const cookieValue = req.cookies?.['csrf_token'];
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieValue) throw new UnauthorizedException('missing csrf_token cookie');
    if (!headerToken) throw new ForbiddenException('missing X-CSRF-Token header on mutation');
    if (cookieValue !== headerToken) throw new ForbiddenException('csrf token mismatch');
    return true;
  }
}
