import { PrismaService } from './prisma.service';

// Verify the class shape via prototype so the test never instantiates
// `new PrismaService()` (which would construct a real PrismaPg adapter and
// attempt a connection). This makes the spec environment-agnostic — it passes
// whether or not a Postgres is reachable.
describe('PrismaService', () => {
  it('exposes $connect and onModuleInit from PrismaClient + NestJS lifecycle', () => {
    expect(typeof PrismaService.prototype.$connect).toBe('function');
    expect(typeof PrismaService.prototype.onModuleInit).toBe('function');
  });
});