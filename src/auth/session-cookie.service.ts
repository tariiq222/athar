import { Injectable } from '@nestjs/common';

const COOKIE_NAME = 'session_token';
const MAX_AGE_SECONDS = 900; // matches JWT_ACCESS_TTL default of 15m

@Injectable()
export class SessionCookieService {
  private get isProd(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  issue(res: { setHeader: (name: string, value: string) => void }, accessToken: string): void {
    const parts = [
      `${COOKIE_NAME}=${accessToken}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${MAX_AGE_SECONDS}`,
    ];
    if (this.isProd) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  clear(res: { setHeader: (name: string, value: string) => void }): void {
    const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
    if (this.isProd) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }
}
