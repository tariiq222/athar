import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Methods considered state-changing per RFC 7231 §4.2.1. OPTIONS is exempt because
// the browser issues a pre-flight, not the user agent; HEAD is safe.
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowList: string[];

  constructor() {
    this.allowList = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ method: string; headers: Record<string, string> }>();
    if (!MUTATION_METHODS.has(req.method)) return true;

    const origin = req.headers['origin'];
    if (!origin) throw new ForbiddenException('missing Origin header on state-changing request');
    if (!this.allowList.includes(origin)) {
      throw new ForbiddenException(`Origin '${origin}' not in allow-list`);
    }
    return true;
  }
}