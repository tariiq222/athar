import { createHmac } from 'crypto';
import { signMoyasarHmac, verifyMoyasarHmac } from './webhook-hmac';

describe('webhook-hmac', () => {
  const secret = 'whsec_test_dummy';

  it('sign + verify round-trip succeeds', () => {
    const body = '{"id":"evt_1","type":"payment_paid"}';
    const sig = signMoyasarHmac(body, secret);
    expect(verifyMoyasarHmac(body, sig, secret)).toBe(true);
  });

  it('verifies a signature that was independently computed (interoperability)', () => {
    const body = '{"id":"evt_1","type":"payment_paid"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sigHex = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    expect(verifyMoyasarHmac(body, `${ts}.${sigHex}`, secret)).toBe(true);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    const body = '{"id":"evt_1"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sigHex = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    const tampered = '{"id":"evt_2"}';
    expect(verifyMoyasarHmac(tampered, `${ts}.${sigHex}`, secret)).toBe(false);
  });

  it('rejects a signature with an old timestamp (replay outside the skew window)', () => {
    const body = '{}';
    const oldTs = String(Math.floor(Date.now() / 1000) - 600); // 10 min ago
    const sigHex = createHmac('sha256', secret).update(`${oldTs}.${body}`).digest('hex');
    expect(verifyMoyasarHmac(body, `${oldTs}.${sigHex}`, secret)).toBe(false);
  });

  it('rejects a signature with a future timestamp (clock skew > 5 min)', () => {
    const body = '{}';
    const futureTs = String(Math.floor(Date.now() / 1000) + 600);
    const sigHex = createHmac('sha256', secret).update(`${futureTs}.${body}`).digest('hex');
    expect(verifyMoyasarHmac(body, `${futureTs}.${sigHex}`, secret)).toBe(false);
  });

  it('rejects a signature with the wrong secret', () => {
    const body = '{}';
    const sig = signMoyasarHmac(body, 'different-secret');
    expect(verifyMoyasarHmac(body, sig, secret)).toBe(false);
  });

  it('rejects a malformed signature (not ts.sigHex shape)', () => {
    expect(verifyMoyasarHmac('{}', 'noperiod', secret)).toBe(false);
    expect(verifyMoyasarHmac('{}', '.onlyhex', secret)).toBe(false);
    expect(verifyMoyasarHmac('{}', 'ts.', secret)).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    expect(verifyMoyasarHmac('{}', 'notanumber.deadbeef', secret)).toBe(false);
  });

  it('rejects empty inputs', () => {
    expect(verifyMoyasarHmac('', '1.sig', secret)).toBe(false);
    expect(verifyMoyasarHmac('body', '', secret)).toBe(false);
    expect(verifyMoyasarHmac('body', '1.sig', '')).toBe(false);
  });
});