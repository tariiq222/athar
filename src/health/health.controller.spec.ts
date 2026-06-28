import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  it('returns ok with db up when query succeeds', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: async () => [{ 1: 1 }] } }],
    }).compile();
    const ctrl = moduleRef.get(HealthController);
    await expect(ctrl.check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });
});