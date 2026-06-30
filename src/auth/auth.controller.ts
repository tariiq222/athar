import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { SessionCookieService } from './session-cookie.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthTokens, SessionUser } from './auth.types';
import { unauthenticated } from '../common/errors/error-envelope';

// Sprint A — Task 10.1: per-route throttling on auth. We use the default
// ThrottlerGuard (per-IP). Tenant-scoped tracking doesn't apply here — auth
// requests have no resolved tenant yet.
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly csrf: CsrfService,
    private readonly cookies: SessionCookieService,
  ) {}

  // auth-session-hardening — session cookie (httpOnly JWT) + CSRF cookie
  // (double-submit, JS-readable). Cookie attribute construction lives in
  // SessionCookieService so the session/csrf endpoints share one source of truth.
  private sessionCookie(token: string): string {
    return this.cookies.sessionCookieHeader(token);
  }

  private csrfCookie(token: string): string {
    return this.cookies.csrfCookieHeader(token);
  }

  // Sprint A — Task 4: GET /auth/me. Returns the SessionUser shape that the
  // client uses to decide onboarding state, gating, and active tenant. The
  // SessionMiddleware (registered on AuthModule) must populate req.user
  // before this handler runs — if it didn't, we throw UNAUTHENTICATED
  // rather than silently returning an empty envelope.
  @Get('me')
  @HttpCode(200)
  me(@Req() req: Request): Promise<SessionUser> {
    if (!req.user) throw unauthenticated();
    return this.auth.me(req.user.sub);
  }

  @Post('register')
  @HttpCode(201)
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    const tokens = await this.auth.register(dto);
    const csrf = this.csrf.issue();
    res.setHeader('Set-Cookie', [
      this.sessionCookie(tokens.accessToken),
      this.csrfCookie(csrf.token),
    ]);
    return { ...tokens, csrfToken: csrf.token };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    const tokens = await this.auth.login(dto);
    const csrf = this.csrf.issue();
    res.setHeader('Set-Cookie', [
      this.sessionCookie(tokens.accessToken),
      this.csrfCookie(csrf.token),
    ]);
    return { ...tokens, csrfToken: csrf.token };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    const tokens = await this.auth.refresh(dto);
    const csrf = this.csrf.issue();
    res.setHeader('Set-Cookie', [
      this.sessionCookie(tokens.accessToken),
      this.csrfCookie(csrf.token),
    ]);
    return { ...tokens, csrfToken: csrf.token };
  }
}
