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
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('LoginDto requires email and a non-empty password', () => {
    const dto = plainToInstance(LoginDto, { email: 'x', password: '' });
    const props = validateSync(dto).map((e) => e.property).sort();
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
      refreshToken:
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dGVzdHNpZ25hdHVyZXZhbHVlMTIz',
    });
    expect(validateSync(ok)).toHaveLength(0);
    expect(bad).toBeDefined();
    expect(good).toBeDefined();
  });
});