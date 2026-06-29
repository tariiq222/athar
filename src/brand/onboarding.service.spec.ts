import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from '../engine/providers/provider.tokens';
import { FakeContentProvider } from '../engine/providers/fake-content-provider';
import { FakeSearchProvider } from '../engine/providers/fake-search-provider';

function makePrismaMock() {
  return {
    usageRecord: { create: jest.fn().mockResolvedValue({}) },
    brandProfile: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    accountProfile: { create: jest.fn() },
  };
}

async function buildService(prisma: any) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      OnboardingService,
      { provide: PrismaService, useValue: prisma },
      { provide: CONTENT_PROVIDER, useClass: FakeContentProvider },
      { provide: SEARCH_PROVIDER, useClass: FakeSearchProvider },
    ],
  }).compile();
  return moduleRef.get(OnboardingService);
}

describe('OnboardingService.analyze', () => {
  it('AC-8: rejects with 422 when consent is not accepted, before any fetch', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
    await expect(
      svc.analyze({ websiteUrl: 'https://x.com', accounts: [], consentAccepted: false } as any, 't1'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.usageRecord.create).not.toHaveBeenCalled();
  });

  it('AC-1: returns tone/products/audience/keywords for a valid website', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
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
    const svc = await buildService(prisma);
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
    const svc = await buildService(prisma);
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
    const svc = await buildService(prisma);
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
    const svc = await buildService(prisma);
    const res = await svc.analyze(
      { websiteUrl: 'https://example.com', accounts: [], consentAccepted: true } as any,
      't1',
    );
    const qs = svc.buildQuestions(res);
    expect(qs.find((q) => q.field === 'topics')!.required).toBe(true);
  });
});