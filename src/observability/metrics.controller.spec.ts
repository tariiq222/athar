import * as client from 'prom-client';
import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  let originalAdminToken: string | undefined;

  beforeEach(() => {
    originalAdminToken = process.env.ADMIN_TOKEN;
  });

  afterEach(() => {
    if (originalAdminToken === undefined) {
      delete process.env.ADMIN_TOKEN;
    } else {
      process.env.ADMIN_TOKEN = originalAdminToken;
    }
    jest.restoreAllMocks();
  });

  it('throws UnauthorizedException when ADMIN_TOKEN is unset and header is missing', () => {
    delete process.env.ADMIN_TOKEN;
    const ctrl = new MetricsController();
    expect(() => ctrl.metrics(undefined)).toThrow();
  });

  it('throws UnauthorizedException when ADMIN_TOKEN is set but header missing', () => {
    process.env.ADMIN_TOKEN = 's3cret';
    const ctrl = new MetricsController();
    expect(() => ctrl.metrics(undefined)).toThrow();
  });

  it('throws UnauthorizedException when ADMIN_TOKEN mismatches the header', () => {
    process.env.ADMIN_TOKEN = 's3cret';
    const ctrl = new MetricsController();
    expect(() => ctrl.metrics('wrong-token')).toThrow();
  });

  it('returns register.metrics() output when token matches', async () => {
    process.env.ADMIN_TOKEN = 's3cret';
    const spy = jest
      .spyOn(client.register, 'metrics')
      .mockResolvedValue('# HELP test_metric test\n# TYPE test_metric counter\ntest_metric 1\n');
    const ctrl = new MetricsController();
    const result = await ctrl.metrics('s3cret');
    expect(result).toContain('test_metric');
    expect(spy).toHaveBeenCalled();
  });
});