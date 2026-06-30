import { Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class CsrfService {
  private static readonly TOKEN_BYTES = 32; // 256-bit random

  issue(): { token: string; cookieValue: string } {
    const token = randomBytes(CsrfService.TOKEN_BYTES).toString('base64url');
    // Cookie value equals the token — the double-submit pattern requires the
    // client to read the cookie and send the same string in X-CSRF-Token.
    return { token, cookieValue: token };
  }

  verify({ headerToken, cookieValue }: { headerToken: string; cookieValue: string }): boolean {
    if (!headerToken || !cookieValue) return false;
    const a = Buffer.from(headerToken);
    const b = Buffer.from(cookieValue);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
