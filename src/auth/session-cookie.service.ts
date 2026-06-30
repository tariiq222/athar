import { Injectable } from '@nestjs/common';

const SESSION_COOKIE_NAME = 'session_token';
const CSRF_COOKIE_NAME = 'csrf_token';
const MAX_AGE_SECONDS = 900; // matches JWT_ACCESS_TTL default of 15m

@Injectable()
export class SessionCookieService {
  private get isProd(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  // Pure builder: returns the Set-Cookie value for the session cookie (httpOnly
  // JWT). Single source of truth for the session cookie attributes — controllers
  // that need to combine multiple Set-Cookie values use this instead of building
  // the string inline.
  sessionCookieHeader(accessToken: string): string {
    const parts = [
      `${SESSION_COOKIE_NAME}=${accessToken}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${MAX_AGE_SECONDS}`,
    ];
    if (this.isProd) parts.push('Secure');
    return parts.join('; ');
  }

  // Pure builder: returns the Set-Cookie value for the CSRF cookie (double-submit).
  // Identical to the session cookie EXCEPT it omits HttpOnly so the SPA can read it
  // and echo it back in the X-CSRF-Token header.
  csrfCookieHeader(token: string): string {
    const parts = [
      `${CSRF_COOKIE_NAME}=${token}`,
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${MAX_AGE_SECONDS}`,
    ];
    if (this.isProd) parts.push('Secure');
    return parts.join('; ');
  }

  issue(res: { setHeader: (name: string, value: string) => void }, accessToken: string): void {
    res.setHeader('Set-Cookie', this.sessionCookieHeader(accessToken));
  }

  clear(res: { setHeader: (name: string, value: string) => void }): void {
    const parts = [`${SESSION_COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
    if (this.isProd) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }
}
