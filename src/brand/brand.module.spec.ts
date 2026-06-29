import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BrandModule } from './brand.module';
import { BrandController } from './brand.controller';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountProfileService } from '../accounts/account-profile.service';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from '../engine/providers/provider.tokens';
import { FakeContentProvider } from '../engine/providers/fake-content-provider';
import { FakeSearchProvider } from '../engine/providers/fake-search-provider';
import { ClaudeClient } from '../engine/providers/claude/claude.client';
import { OpenAiImageClient } from '../engine/providers/openai/openai-image.client';
import { VisionVerifier } from '../engine/providers/openai/vision-verifier';
import { ImageStorageService } from '../engine/storage/image-storage.service';
import { OverlayRenderer } from '../engine/providers/openai/overlay-renderer';
import { MonthPlanService } from '../engine/month-plan/month-plan.service';

describe('BrandModule', () => {
  it('compiles and resolves the controller + service', async () => {
    // EngineModule pulls in the real Claude/OpenAI SDKs at construction time
    // and MonthPlanService.onModuleInit opens Redis — stub them all (same
    // pattern as engine.module.spec.ts). The seam tokens CONTENT_PROVIDER /
    // SEARCH_PROVIDER are swapped with the fakes so the BrandBrain service
    // resolves them in a test-friendly shape.
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), BrandModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ usageRecord: { create: jest.fn() }, brandProfile: {} })
      .overrideProvider(AccountProfileService)
      .useValue({})
      .overrideProvider(ClaudeClient)
      .useValue({} as any)
      .overrideProvider(OpenAiImageClient)
      .useValue({} as any)
      .overrideProvider(VisionVerifier)
      .useValue({} as any)
      .overrideProvider(ImageStorageService)
      .useValue({} as any)
      .overrideProvider(OverlayRenderer)
      .useValue({} as any)
      .overrideProvider(MonthPlanService)
      .useValue({} as any)
      .overrideProvider(CONTENT_PROVIDER)
      .useClass(FakeContentProvider)
      .overrideProvider(SEARCH_PROVIDER)
      .useClass(FakeSearchProvider)
      .compile();

    expect(moduleRef.get(BrandController)).toBeInstanceOf(BrandController);
    expect(moduleRef.get(OnboardingService)).toBeInstanceOf(OnboardingService);
  });
});
