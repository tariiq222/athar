import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TokenService } from './token.service';

export interface SessionUser {
  sub: string;
  tenantId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly tokens: TokenService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = req.cookies?.['session_token'];
    if (!token) return next();
    try {
      const payload = await this.tokens.verifyAccess(token);
      req.user = { sub: payload.sub, tenantId: payload.tenantId };
    } catch {
      // Invalid token = anonymous. Do NOT call next(err) — authorization is the
      // JwtAuthGuard's responsibility, this middleware only attaches identity.
    }
    next();
  }
}
