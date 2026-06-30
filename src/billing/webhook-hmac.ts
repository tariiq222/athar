import { createHmac, timingSafeEqual } from 'crypto';

// Sprint A — Task 6.1: HMAC-SHA256 webhook signature verification.
// Replaces the old `body.secret_token` constant-time check (which is a
// shared-secret-bearer scheme — anyone who reads the body can forge the
// header). HMAC binds the signature to the exact request bytes plus a
// timestamp, so a replay outside the skew window is rejected even if the
// signature was once valid.
//
// Signature format on the wire: `${ts}.${sigHex}` where:
//   - ts: Unix seconds at send time
//   - sigHex: HMAC-SHA256(secret, `${ts}.${body}`) rendered as hex
const MAX_SKEW_SEC = 300;

export function signMoyasarHmac(body: string, secret: string, ts?: number): string {
  const tsStr = String(ts ?? Math.floor(Date.now() / 1000));
  const sigHex = createHmac('sha256', secret).update(`${tsStr}.${body}`).digest('hex');
  return `${tsStr}.${sigHex}`;
}

export function verifyMoyasarHmac(body: string, signature: string, secret: string): boolean {
  if (!body || !signature || !secret) return false;
  const parts = signature.split('.', 2);
  if (parts.length !== 2) return false;
  const [tsStr, sigHex] = parts;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SEC) return false;

  const expected = createHmac('sha256', secret).update(`${tsStr}.${body}`).digest();
  const received = Buffer.from(sigHex, 'hex');
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
