import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AuthController } from './auth/auth.controller';
import { AccountProfileController } from './accounts/account-profile.controller';
import { UserController } from './user/user.controller';

// Env vars for SDK clients + JWT signing.
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.JWT_ACCESS_TTL ||= '15m';
process.env.JWT_REFRESH_TTL ||= '7d';
process.env.TRIAL_DURATION_DAYS ||= '7';
process.env.PURGE_RETENTION_DAYS ||= '30';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.OPENAI_API_KEY ||= 'test-openai-key';
process.env.OPENAI_IMAGE_MODEL ||= 'gpt-image-1';
process.env.OPENAI_VISION_MODEL ||= 'gpt-4o-mini';
process.env.ANTHROPIC_API_KEY ||= 'test-anthropic-key';
process.env.ANTHROPIC_MODEL ||= 'claude-sonnet-4-5';
process.env.MINIO_ENDPOINT ||= 'localhost';
process.env.MINIO_PORT ||= '9000';
process.env.MINIO_ACCESS_KEY ||= 'test-minio';
process.env.MINIO_SECRET_KEY ||= 'test-minio-secret';
process.env.MINIO_BUCKET ||= 'athar-images';
process.env.OPENROUTER_API_KEY ||= 'test-openrouter-key';
process.env.REDIS_HOST ||= 'localhost';
process.env.REDIS_PORT ||= '6379';

describe('AppModule', () => {
  it('compiles with auth, accounts and user controllers wired', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(AuthController)).toBeDefined();
    expect(moduleRef.get(AccountProfileController)).toBeDefined();
    expect(moduleRef.get(UserController)).toBeDefined();
  });
});