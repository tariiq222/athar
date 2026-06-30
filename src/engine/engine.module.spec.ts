import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EngineModule } from './engine.module';
import { PipelineService } from './pipeline/pipeline.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiImageClient } from './providers/openai/openai-image.client';
import { VisionVerifier } from './providers/openai/vision-verifier';
import { ImageStorageService } from './storage/image-storage.service';
import { OverlayRenderer } from './providers/openai/overlay-renderer';
import { ClaudeClient } from './providers/claude/claude.client';
import { MonthPlanService } from './month-plan/month-plan.service';

describe('EngineModule', () => {
  it('resolves PipelineService and binds the seam tokens', async () => {
    // The real OpenAI/MinIO/Claude SDKs require API keys at construction
    // time, and MonthPlanService.onModuleInit opens a Redis connection —
    // replace them all with no-op stubs for the wiring test.
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), EngineModule],
    })
      .overrideProvider(PrismaService)
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
      .compile();

    expect(moduleRef.get(PipelineService)).toBeInstanceOf(PipelineService);
    expect(moduleRef.get('ContentProvider')).toBeDefined();
    expect(moduleRef.get('ImageProvider')).toBeDefined();
    expect(moduleRef.get('SearchProvider')).toBeDefined();
  });
});
