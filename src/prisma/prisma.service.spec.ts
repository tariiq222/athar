import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('is a PrismaClient with $connect', () => {
    const svc = new PrismaService();
    expect(typeof svc.$connect).toBe('function');
    expect(typeof svc.onModuleInit).toBe('function');
  });
});