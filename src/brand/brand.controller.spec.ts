import { Test } from '@nestjs/testing';
import { AppError } from '../common/errors/error-envelope';
import { BrandController } from './brand.controller';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';

const tenant = { tenantId: 't1', userId: 'u1' };

// Env vars for AuthModule's TokenService.
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.JWT_ACCESS_TTL ||= '15m';
process.env.JWT_REFRESH_TTL ||= '7d';

function makeMocks() {
  const service = {
    analyze: jest.fn(),
    buildQuestions: jest.fn(),
    commit: jest.fn(),
  };
  const prisma = {
    brandProfile: { findFirst: jest.fn(), update: jest.fn() },
  };
  return { service, prisma };
}

async function buildController(service: any, prisma: any) {
  const moduleRef = await Test.createTestingModule({
    controllers: [BrandController],
    providers: [
      { provide: OnboardingService, useValue: service },
      { provide: PrismaService, useValue: prisma },
      {
        provide: TokenService,
        useValue: {
          issueTokens: jest.fn(),
          verifyAccess: jest.fn(),
          verifyRefresh: jest.fn(),
        } as any,
      },
      { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
      { provide: TenantGuard, useValue: { canActivate: () => true } },
    ],
  }).compile();
  return moduleRef.get(BrandController);
}

describe('BrandController', () => {
  it('POST /brand/analyze returns analysis + questions', async () => {
    const { service, prisma } = makeMocks();
    const analysis = { source: 'website', notes: [] };
    service.analyze.mockResolvedValue(analysis);
    service.buildQuestions.mockReturnValue([{ id: 'topics', field: 'topics' }]);
    const ctrl = await buildController(service, prisma);
    const out = await ctrl.analyze({ accounts: [], consentAccepted: true } as any, tenant as any);
    expect(service.analyze).toHaveBeenCalledWith({ accounts: [], consentAccepted: true }, 't1');
    expect(out).toEqual({ analysis, questions: [{ id: 'topics', field: 'topics' }] });
  });

  it('POST /brand/profile commits and returns the profile', async () => {
    const { service, prisma } = makeMocks();
    const profile = { id: 'b1', tenantId: 't1' };
    service.commit.mockResolvedValue(profile);
    const ctrl = await buildController(service, prisma);
    const body = { tone: 't', topics: ['x'], accounts: [{ platform: 'x' }] } as any;
    const out = await ctrl.create(body, tenant as any);
    expect(service.commit).toHaveBeenCalledWith(body, 't1', [{ platform: 'x' }]);
    expect(out).toBe(profile);
  });

  it('GET /brand/profile/:id returns the tenant-scoped profile', async () => {
    const { service, prisma } = makeMocks();
    prisma.brandProfile.findFirst.mockResolvedValue({ id: 'b1', tenantId: 't1' });
    const ctrl = await buildController(service, prisma);
    const out = await ctrl.get('b1', tenant as any);
    expect(prisma.brandProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'b1', tenantId: 't1' },
    });
    expect(out).toEqual({ id: 'b1', tenantId: 't1' });
  });

  it('AC-7: GET /brand/profile/:id of another tenant returns 404', async () => {
    const { service, prisma } = makeMocks();
    prisma.brandProfile.findFirst.mockResolvedValue(null);
    const ctrl = await buildController(service, prisma);
    await expect(ctrl.get('other', tenant as any)).rejects.toBeInstanceOf(AppError);
  });

  it('AC-6: PATCH /brand/profile/:id updates only present fields, tenant-scoped', async () => {
    const { service, prisma } = makeMocks();
    prisma.brandProfile.findFirst.mockResolvedValue({ id: 'b1', tenantId: 't1' });
    prisma.brandProfile.update.mockResolvedValue({ id: 'b1', tenantId: 't1', topics: ['new'] });
    const ctrl = await buildController(service, prisma);
    const out = await ctrl.patch('b1', { topics: ['new'] } as any, tenant as any);
    expect(prisma.brandProfile.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { topics: ['new'] },
    });
    expect(out.topics).toEqual(['new']);
  });

  it('AC-7: PATCH of another tenant returns 404 without updating', async () => {
    const { service, prisma } = makeMocks();
    prisma.brandProfile.findFirst.mockResolvedValue(null);
    const ctrl = await buildController(service, prisma);
    await expect(ctrl.patch('other', { tone: 'x' } as any, tenant as any)).rejects.toBeInstanceOf(
      AppError,
    );
    expect(prisma.brandProfile.update).not.toHaveBeenCalled();
  });
});
