import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CsrfService } from './csrf.service';
import { SessionCookieService } from './session-cookie.service';

@Controller('auth')
export class CsrfController {
  constructor(
    private readonly csrfService: CsrfService,
    private readonly cookies: SessionCookieService,
  ) {}

  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response): { csrfToken: string } {
    const { token } = this.csrfService.issue();
    res.setHeader('Set-Cookie', this.cookies.csrfCookieHeader(token));
    return { csrfToken: token };
  }
}
