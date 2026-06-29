import { timingSafeEqual } from 'crypto';

export function verifyWebhookToken(received: string, expected: string): boolean {
  if (!received || !expected) return false;
  if (received.length !== expected.length) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return timingSafeEqual(a, b);
}