import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';
import { RefreshDto } from './refresh.dto';

describe('auth DTOs', () => {
  it('RegisterDto rejects bad email and short password', () => {
    const dto = plainToInstance(RegisterDto, {
      tenantName: 'Acme',
      email: 'not-an-email',
      password: 'short',
      acceptTerms: true,
      termsVersion: 'v1',
    });
    const errors = validateSync(dto);
    const props = errors.map((e) => e.property).sort();
    expect(props).toEqual(['email', 'password']);
  });

  it('RegisterDto accepts a valid payload (name optional)', () => {
    const dto = plainToInstance(RegisterDto, {
      tenantName: 'Acme',
      email: 'founder@acme.com',
      password: 'longenough',
      acceptTerms: true,
      termsVersion: 'v1',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  // Sprint A — Task 4.1: PDPL consent capture.

  it('RegisterDto rejects when acceptTerms is false (must be true)', () => {
    const dto = plainToInstance(RegisterDto, {
      tenantName: 'Acme',
      email: 'founder@acme.com',
      password: 'longenough',
      acceptTerms: false,
      termsVersion: 'v1',
    });
    const props = validateSync(dto).map((e) => e.property);
    expect(props).toContain('acceptTerms');
  });

  it('RegisterDto rejects when acceptTerms is missing', () => {
    const dto = plainToInstance(RegisterDto, {
      tenantName: 'Acme',
      email: 'founder@acme.com',
      password: 'longenough',
      termsVersion: 'v1',
    });
    const props = validateSync(dto).map((e) => e.property);
    expect(props).toContain('acceptTerms');
  });

  it('RegisterDto rejects when termsVersion is missing', () => {
    const dto = plainToInstance(RegisterDto, {
      tenantName: 'Acme',
      email: 'founder@acme.com',
      password: 'longenough',
      acceptTerms: true,
    });
    const props = validateSync(dto).map((e) => e.property);
    expect(props).toContain('termsVersion');
  });

  it('LoginDto requires email and a non-empty password', () => {
    const dto = plainToInstance(LoginDto, { email: 'x', password: '' });
    const props = validateSync(dto)
      .map((e) => e.property)
      .sort();
    expect(props).toEqual(['email', 'password']);
  });

  it('RefreshDto requires a JWT-shaped token', () => {
    const bad = plainToInstance(RefreshDto, { refreshToken: 'nope' });
    expect(validateSync(bad)).toHaveLength(1);
    const good = plainToInstance(RefreshDto, {
      refreshToken: 'aaaa.bbbb.cccc'.replace(/[^.]/g, 'a'),
    });
    // a structurally JWT-like string (three base64url segments)
    const ok = plainToInstance(RefreshDto, {
      refreshToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dGVzdHNpZ25hdHVyZXZhbHVlMTIz',
    });
    expect(validateSync(ok)).toHaveLength(0);
    expect(bad).toBeDefined();
    expect(good).toBeDefined();
  });
});
