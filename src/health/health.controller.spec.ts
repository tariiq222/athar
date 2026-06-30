import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RedisHealthIndicator } from './redis-health.indicator';

describe('HealthController', () => {
  describe('live', () => {
    it('returns ok plainly without touching dependencies', () => {
      const ctrl = Object.create(HealthController.prototype);
      expect(ctrl.live()).toEqual({ status: 'ok' });
    });
  });

  describe('ready', () => {
    // Terminus's PrismaHealthIndicator first tries $runCommandRaw({ ping: 1 })
    // (MongoDB path) and only falls back to $queryRawUnsafe('SELECT 1') when
    // the error contains "Use the mongodb provider". Mock both so the ping
    // resolves through the SQL path.
    const mockPrisma = {
      $runCommandRaw: () => {
        throw new Error('Use the mongodb provider');
      },
      $queryRawUnsafe: async () => [{ '?column?': 1 }],
    };

    it('runs db and redis pingChecks and aggregates result', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TerminusModule],
        controllers: [HealthController],
        providers: [
          { provide: PrismaService, useValue: mockPrisma },
          {
            provide: RedisHealthIndicator,
            useValue: {
              pingCheck: jest.fn().mockResolvedValue({ redis: { status: 'up' } }),
            },
          },
        ],
      }).compile();
      const ctrl = moduleRef.get(HealthController);
      const result = await ctrl.ready();
      expect(result.info).toMatchObject({
        db: { status: 'up' },
        redis: { status: 'up' },
      });
      expect(result.status).toBe('ok');
    });

    it('reports down when redis pingCheck throws', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TerminusModule],
        controllers: [HealthController],
        providers: [
          { provide: PrismaService, useValue: mockPrisma },
          {
            provide: RedisHealthIndicator,
            useValue: {
              pingCheck: jest.fn().mockRejectedValue(new Error('redis unreachable')),
            },
          },
        ],
      }).compile();
      const ctrl = moduleRef.get(HealthController);
      await expect(ctrl.ready()).rejects.toThrow();
    });

    it('reports down when DB pingCheck throws (Prisma unavailable)', async () => {
      const brokenPrisma = {
        $runCommandRaw: () => {
          throw new Error('Use the mongodb provider');
        },
        // Simulate a DB connection failure on the SQL fallback path.
        $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('connection refused')),
      };
      const moduleRef = await Test.createTestingModule({
        imports: [TerminusModule],
        controllers: [HealthController],
        providers: [
          { provide: PrismaService, useValue: brokenPrisma },
          {
            provide: RedisHealthIndicator,
            useValue: {
              pingCheck: jest.fn().mockResolvedValue({ redis: { status: 'up' } }),
            },
          },
        ],
      }).compile();
      const ctrl = moduleRef.get(HealthController);
      await expect(ctrl.ready()).rejects.toThrow();
    });

    it('live endpoint is independent — returns ok even when dependencies are unreachable', () => {
      // Direct instantiation — no DI needed; live() has no async deps.
      const ctrl = Object.create(HealthController.prototype);
      expect(ctrl.live()).toEqual({ status: 'ok' });
    });
  });
});
