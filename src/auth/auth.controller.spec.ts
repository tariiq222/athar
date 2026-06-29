import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const tokens = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer' as const, expiresIn: 900 };
  const service = {
    register: jest.fn(async () => tokens),
    login: jest.fn(async () => tokens),
    refresh: jest.fn(async () => tokens),
  };
  const ctrl = new AuthController(service as any);

  it('register delegates to the service', async () => {
    const dto = { tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' };
    await expect(ctrl.register(dto as any)).resolves.toBe(tokens);
    expect(service.register).toHaveBeenCalledWith(dto);
  });

  it('login delegates to the service', async () => {
    await expect(ctrl.login({ email: 'a@b.com', password: 'x' } as any)).resolves.toBe(tokens);
  });

  it('refresh delegates to the service', async () => {
    await expect(ctrl.refresh({ refreshToken: 'r' } as any)).resolves.toBe(tokens);
  });
});
