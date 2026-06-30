import { Test } from '@nestjs/testing';
import { AppError } from '../common/errors/error-envelope';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountProfileService } from '../accounts/account-profile.service';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from '../engine/providers/provider.tokens';
import { FakeContentProvider } from '../engine/providers/fake-content-provider';
import { FakeSearchProvider } from '../engine/providers/fake-search-provider';

function makePrismaMock() {
  return {
    usageRecord: { create: jest.fn().mockResolvedValue({}) },
    brandProfile: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };
}

function makeAccountProfileServiceMock() {
  return {
    createForTenant: jest.fn().mockImplementation((tenantId: string, dto: any) =>
      Promise.resolve({
        id: 'ap-' + Math.random().toString(36).slice(2, 8),
        tenantId,
        brandProfileId: dto.brandProfileId,
        platform: dto.platform,
        handle: dto.handle ?? null,
      }),
    ),
    listForTenant: jest.fn(),
    updateForTenant: jest.fn(),
    deleteForTenant: jest.fn(),
  };
}

async function buildHarness(prisma: any, accountProfiles: any = makeAccountProfileServiceMock()) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      OnboardingService,
      { provide: PrismaService, useValue: prisma },
      { provide: AccountProfileService, useValue: accountProfiles },
      { provide: CONTENT_PROVIDER, useClass: FakeContentProvider },
      { provide: SEARCH_PROVIDER, useClass: FakeSearchProvider },
    ],
  }).compile();
  return { svc: moduleRef.get(OnboardingService), accountProfiles };
}

describe('OnboardingService.analyze', () => {
  it('AC-8: rejects with 422 when consent is not accepted, before any fetch', async () => {
    const prisma = makePrismaMock();
    const { svc } = await buildHarness(prisma);
    await expect(
      svc.analyze({ websiteUrl: 'https://x.com', accounts: [], consentAccepted: false } as any, 't1'),
    ).rejects.toBeInstanceOf(AppError);
    expect(prisma.usageRecord.create).not.toHaveBeenCalled();
  });

  it('AC-1: returns tone/products/audience/keywords for a valid website', async () => {
    const prisma = makePrismaMock();
    const { svc } = await buildHarness(prisma);
    const res = await svc.analyze(
      { websiteUrl: 'https://example.com', accounts: [], consentAccepted: true } as any,
      't1',
    );
    expect(res.tone.length).toBeGreaterThan(0);
    expect(res.products.length).toBeGreaterThan(0);
    expect(res.audience.length).toBeGreaterThan(0);
    expect(res.keywords.length).toBeGreaterThan(0);
    expect(res.fetchStatus.website).toBe('ok');
    expect(res.source).toBe('website');
  });

  it('records a UsageRecord per provider call (fetch=search, summarize=text)', async () => {
    const prisma = makePrismaMock();
    const { svc } = await buildHarness(prisma);
    await svc.analyze(
      { websiteUrl: 'https://example.com', accounts: [{ platform: 'x', handle: '@a' }], consentAccepted: true } as any,
      't1',
    );
    const kinds = prisma.usageRecord.create.mock.calls.map((c: any[]) => c[0].data.kind);
    expect(kinds.filter((k: string) => k === 'search').length).toBe(2); // website + 1 account
    expect(kinds.filter((k: string) => k === 'text').length).toBe(1);    // one summarize
    prisma.usageRecord.create.mock.calls.forEach((c: any[]) =>
      expect(c[0].data.tenantId).toBe('t1'),
    );
  });

  it('AC-2/US-2.1: a failed website fetch does not throw and is marked failed', async () => {
    const prisma = makePrismaMock();
    const { svc } = await buildHarness(prisma);
    const res = await svc.analyze(
      { websiteUrl: 'https://fail.example.com', accounts: [], consentAccepted: true } as any,
      't1',
    );
    expect(res.fetchStatus.website).toBe('failed');
    expect(res.notes.length).toBeGreaterThan(0);
    expect(res.source).toBe('manual'); // nothing fetched
  });

  it('caps fetches at maxFetches and notes the skip', async () => {
    const prisma = makePrismaMock();
    const { svc } = await buildHarness(prisma);
    const accounts = Array.from({ length: 10 }, (_, i) => ({ platform: 'x', handle: `@a${i}` }));
    const res = await svc.analyze(
      { websiteUrl: 'https://example.com', accounts, consentAccepted: true } as any,
      't1',
    );
    const fetchCalls = prisma.usageRecord.create.mock.calls
      .map((c: any[]) => c[0].data.kind)
      .filter((k: string) => k === 'search').length;
    expect(fetchCalls).toBe(6); // BRAND_ANALYZE_CONFIG.maxFetches
    expect(res.notes.some((n) => n.includes('سقف') || n.toLowerCase().includes('cap'))).toBe(true);
    expect(res.fetchStatus.accounts.some((a) => a.status === 'skipped')).toBe(true);
  });

  it('buildQuestions delegates to the pure function', async () => {
    const prisma = makePrismaMock();
    const { svc } = await buildHarness(prisma);
    const res = await svc.analyze(
      { websiteUrl: 'https://example.com', accounts: [], consentAccepted: true } as any,
      't1',
    );
    const qs = svc.buildQuestions(res);
    expect(qs.find((q) => q.field === 'topics')!.required).toBe(true);
  });

  it('source="accounts" when website fails but an account succeeds', async () => {
    const prisma = makePrismaMock();
    const search: any = {
      research: jest.fn(),
      fetch: jest.fn(async (input: { url: string }) => {
        if (input.url === 'https://fail.example.com') {
          return { ok: false, error: 'unreachable' };
        }
        return { ok: true, text: `content of ${input.url}` };
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountProfileService, useValue: makeAccountProfileServiceMock() },
        { provide: CONTENT_PROVIDER, useClass: FakeContentProvider },
        { provide: SEARCH_PROVIDER, useValue: search },
      ],
    }).compile();
    const svc = moduleRef.get(OnboardingService);
    const res = await svc.analyze(
      {
        websiteUrl: 'https://fail.example.com',
        accounts: [{ platform: 'x', handle: '@acct' }],
        consentAccepted: true,
      } as any,
      't1',
    );
    expect(res.fetchStatus.website).toBe('failed');
    expect(res.fetchStatus.accounts[0].status).toBe('ok');
    expect(res.source).toBe('accounts');
  });

  it('source="mixed" when both website and an account succeed', async () => {
    const prisma = makePrismaMock();
    const search: any = {
      research: jest.fn(),
      fetch: jest.fn(async (input: { url: string }) => ({
        ok: true,
        text: `content of ${input.url}`,
      })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountProfileService, useValue: makeAccountProfileServiceMock() },
        { provide: CONTENT_PROVIDER, useClass: FakeContentProvider },
        { provide: SEARCH_PROVIDER, useValue: search },
      ],
    }).compile();
    const svc = moduleRef.get(OnboardingService);
    const res = await svc.analyze(
      {
        websiteUrl: 'https://example.com',
        accounts: [{ platform: 'x', handle: '@acct' }],
        consentAccepted: true,
      } as any,
      't1',
    );
    expect(res.fetchStatus.website).toBe('ok');
    expect(res.fetchStatus.accounts[0].status).toBe('ok');
    expect(res.source).toBe('mixed');
  });
});

describe('OnboardingService.commit', () => {
  const draft = {
    tone: 'friendly',
    audience: 'smb',
    goals: 'grow',
    topics: ['tips'],
    prohibitions: ['politics'],
    competitors: ['c-a'],
    keywords: ['growth'],
    brandKit: { colors: ['#fff'], visualStyle: 'clean', font: 'IBM Plex Sans Arabic' },
    accounts: [{ platform: 'x', handle: '@acme' }],
  } as any;

  it('AC-5: creates a BrandProfile with tenantId, learnedPreferences="" and brandKit json', async () => {
    const prisma = makePrismaMock();
    prisma.brandProfile.create.mockResolvedValue({ id: 'b1', tenantId: 't1', ...draft });
    const { svc } = await buildHarness(prisma);
    const out = await svc.commit(draft, 't1', draft.accounts);
    expect(out.id).toBe('b1');
    const arg = prisma.brandProfile.create.mock.calls[0][0].data;
    expect(arg.tenantId).toBe('t1');
    expect(arg.learnedPreferences).toBe('');
    expect(arg.brandKit).toEqual(draft.brandKit);
    expect(arg.topics).toEqual(['tips']);
  });

  it('AC-5/AC-7: creates one AccountProfile per account via AccountProfileService, each scoped by tenantId + brandProfileId', async () => {
    const prisma = makePrismaMock();
    const accountProfiles = makeAccountProfileServiceMock();
    prisma.brandProfile.create.mockResolvedValue({ id: 'b1', tenantId: 't1', ...draft });
    const { svc } = await buildHarness(prisma, accountProfiles);
    await svc.commit(draft, 't1', draft.accounts);
    expect(accountProfiles.createForTenant).toHaveBeenCalledTimes(1);
    const callArgs = accountProfiles.createForTenant.mock.calls[0];
    expect(callArgs[0]).toBe('t1');
    expect(callArgs[1]).toEqual({
      brandProfileId: 'b1',
      platform: 'x',
      handle: '@acme',
    });
  });

  it('rejects with 422 when tone is missing', async () => {
    const prisma = makePrismaMock();
    const { svc } = await buildHarness(prisma);
    await expect(svc.commit({ ...draft, tone: '' }, 't1', [])).rejects.toMatchObject({
      response: { statusCode: 422, error: 'commit_incomplete', fields: ['tone'] },
    });
    expect(prisma.brandProfile.create).not.toHaveBeenCalled();
  });

  it('rejects with 422 when topics is empty', async () => {
    const prisma = makePrismaMock();
    const { svc } = await buildHarness(prisma);
    await expect(svc.commit({ ...draft, topics: [] }, 't1', [])).rejects.toMatchObject({
      response: { statusCode: 422, error: 'commit_incomplete', fields: ['topics'] },
    });
  });
});
