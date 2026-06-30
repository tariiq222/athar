import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BrandModule } from './brand.module';
import { BrandController } from './brand.controller';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from '../engine/providers/provider.tokens';
import { FakeContentProvider } from '../engine/providers/fake-content-provider';
import { FakeSearchProvider } from '../engine/providers/fake-search-provider';
import { ClaudeClient } from '../engine/providers/claude/claude.client';
import { OpenAiImageClient } from '../engine/providers/openai/openai-image.client';
import { VisionVerifier } from '../engine/providers/openai/vision-verifier';
import { ImageStorageService } from '../engine/storage/image-storage.service';
import { OverlayRenderer } from '../engine/providers/openai/overlay-renderer';
import { MonthPlanService } from '../engine/month-plan/month-plan.service';

// Env vars for JWT signing required by AuthModule's TokenService.
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.JWT_ACCESS_TTL ||= '15m';
process.env.JWT_REFRESH_TTL ||= '7d';
process.env.TRIAL_DURATION_DAYS ||= '7';
process.env.PURGE_RETENTION_DAYS ||= '30';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test?schema=public';

describe('BrandModule', () => {
  it('compiles and resolves the controller + service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      // Sprint A Task 10.1: AuthController uses ThrottlerGuard, so AuthModule
      // needs THROTTLER:MODULE_OPTIONS in scope when compiled standalone.
      ThrottlerModule.forRoot([
        { name: 'short', ttl: 1000, limit: 3 },
        { name: 'medium', ttl: 60_000, limit: 20 },
      ]),
      BrandModule,
    ],
    })
      .overrideProvider(PrismaService)
      .useValue({ usageRecord: { create: jest.fn() }, brandProfile: {}, accountProfile: {} })
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
      .overrideProvider(TokenService)
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
