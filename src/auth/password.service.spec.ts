import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('produces an argon2id hash distinct from the plaintext', async () => {
    const hash = await svc.hash('s3cret-passw0rd');
    expect(hash).not.toBe('s3cret-passw0rd');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verify returns true for the correct password', async () => {
    const hash = await svc.hash('s3cret-passw0rd');
    await expect(svc.verify(hash, 's3cret-passw0rd')).resolves.toBe(true);
  });

  it('verify returns false for a wrong password', async () => {
    const hash = await svc.hash('s3cret-passw0rd');
    await expect(svc.verify(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('verify returns false (never throws) on a malformed hash', async () => {
    await expect(svc.verify('not-a-hash', 'whatever')).resolves.toBe(false);
  });
});