import { HealthCheckError } from '@nestjs/terminus';

// Capture the mock functions so we can control them per-test.
const mockDisconnect = jest.fn();
const mockConnect = jest.fn();
const mockPing = jest.fn();

// The mock constructor is captured here so tests can assert on the args passed
// to `new IORedis({...})` without needing a dynamic import.
const MockIORedisConstructor = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
  ping: mockPing,
  disconnect: mockDisconnect,
}));

// Mock ioredis BEFORE importing the indicator so the module-level import of
// IORedis is replaced before it executes.
jest.mock('ioredis', () => {
  const Ctor = MockIORedisConstructor;
  (Ctor as any).Redis = Ctor;
  return { __esModule: true, default: Ctor, Redis: Ctor };
});

// Import AFTER the mock is in place.
import { RedisHealthIndicator } from './redis-health.indicator';

describe('RedisHealthIndicator.pingCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply the implementation after clearAllMocks resets it.
    MockIORedisConstructor.mockImplementation(() => ({
      connect: mockConnect,
      ping: mockPing,
      disconnect: mockDisconnect,
    }));
  });

  // ---- healthy path -------------------------------------------------------

  it('returns status up when Redis responds with PONG', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');

    const indicator = new RedisHealthIndicator();
    const result = await indicator.pingCheck('redis');

    expect(result).toMatchObject({ redis: { status: 'up' } });
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('always calls disconnect in the finally block on success', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');

    const indicator = new RedisHealthIndicator();
    await indicator.pingCheck('redis');

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  // ---- unhealthy / failure paths ------------------------------------------

  it('throws HealthCheckError when ping returns a value other than PONG', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('NOT_PONG');

    const indicator = new RedisHealthIndicator();
    await expect(indicator.pingCheck('redis')).rejects.toBeInstanceOf(HealthCheckError);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('throws HealthCheckError when connect rejects (connection refused)', async () => {
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    const indicator = new RedisHealthIndicator();
    await expect(indicator.pingCheck('redis')).rejects.toBeInstanceOf(HealthCheckError);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('throws HealthCheckError and still disconnects when ping rejects', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockRejectedValue(new Error('socket closed'));

    const indicator = new RedisHealthIndicator();
    await expect(indicator.pingCheck('redis')).rejects.toBeInstanceOf(HealthCheckError);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('throws HealthCheckError when the timeout fires before connect+ping resolve', async () => {
    // Simulate a connect that hangs forever.
    mockConnect.mockReturnValue(new Promise(() => {}));
    // Use a very short timeout so the race resolves quickly in the test.
    const indicator = new RedisHealthIndicator();
    await expect(indicator.pingCheck('redis', { timeout: 1 })).rejects.toBeInstanceOf(
      HealthCheckError,
    );
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  // ---- constructor arg assertions -----------------------------------------

  it('uses REDIS_HOST and REDIS_PORT env vars for connection params', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');

    const originalHost = process.env.REDIS_HOST;
    const originalPort = process.env.REDIS_PORT;
    process.env.REDIS_HOST = 'custom-redis-host';
    process.env.REDIS_PORT = '6380';
    MockIORedisConstructor.mockClear();

    const indicator = new RedisHealthIndicator();
    await indicator.pingCheck('redis');

    const constructorCall = MockIORedisConstructor.mock.calls[0][0] as {
      host: string;
      port: number;
    };
    expect(constructorCall.host).toBe('custom-redis-host');
    expect(constructorCall.port).toBe(6380);

    process.env.REDIS_HOST = originalHost;
    process.env.REDIS_PORT = originalPort;
  });

  it('falls back to localhost:6379 when env vars are not set', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');

    const savedHost = process.env.REDIS_HOST;
    const savedPort = process.env.REDIS_PORT;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    MockIORedisConstructor.mockClear();

    const indicator = new RedisHealthIndicator();
    await indicator.pingCheck('redis');

    const constructorCall = MockIORedisConstructor.mock.calls[0][0] as {
      host: string;
      port: number;
    };
    expect(constructorCall.host).toBe('localhost');
    expect(constructorCall.port).toBe(6379);

    process.env.REDIS_HOST = savedHost;
    process.env.REDIS_PORT = savedPort;
  });

  it('uses custom key name in HealthIndicatorResult', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');

    const indicator = new RedisHealthIndicator();
    const result = await indicator.pingCheck('my-cache');

    expect(result).toHaveProperty('my-cache');
    expect((result as Record<string, { status: string }>)['my-cache'].status).toBe('up');
  });

  it('passes the provided timeout as connectTimeout to the IORedis constructor', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');
    MockIORedisConstructor.mockClear();

    const indicator = new RedisHealthIndicator();
    await indicator.pingCheck('redis', { timeout: 2500 });

    const constructorCall = MockIORedisConstructor.mock.calls[0][0] as {
      connectTimeout: number;
    };
    expect(constructorCall.connectTimeout).toBe(2500);
  });

  it('defaults connectTimeout to 1000 ms when no timeout option is provided', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');
    MockIORedisConstructor.mockClear();

    const indicator = new RedisHealthIndicator();
    await indicator.pingCheck('redis');

    const constructorCall = MockIORedisConstructor.mock.calls[0][0] as {
      connectTimeout: number;
    };
    expect(constructorCall.connectTimeout).toBe(1000);
  });
});
