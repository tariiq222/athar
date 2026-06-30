// Phase 5 — publishing module smoke (route contract).
// Boots PublishingModule with mocked Prisma + queue + mail transporter, with
// JwtAuthGuard/TenantGuard overridden to inject a stub tenant context. Asserts
// GET /api/v1/posts/:id/export returns a well-formed ExportPayload.
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import { PublishingModule } from '../src/publishing/publishing.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REMINDER_QUEUE } from '../src/publishing/reminder.constants';
import { ReminderProcessor } from '../src/publishing/reminder.processor';
import { MAIL_TRANSPORTER } from '../src/notifications/email.channel';
import { JwtAuthGuard } from '../src/tenant/jwt-auth.guard';
import { TenantGuard } from '../src/tenant/tenant.guard';

const approvedPost = {
  id: 'p1',
  tenantId: 't1',
  platform: 'linkedin',
  status: 'approved',
  text: 'Hello world',
  hashtags: ['#a', '#b', '#c'],
  image: { url: 'https://img/p1.png' },
  citations: [],
};

describe('Publishing (e2e smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const allow = {
      canActivate: (ctx: any) => {
        const req = ctx.switchToHttp().getRequest();
        req.tenantContext = { userId: 'u1', tenantId: 't1' };
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        PublishingModule,
        PrismaModule,
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 1000, limit: 3 },
          { name: 'medium', ttl: 60_000, limit: 20 },
        ]),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ post: { findFirst: async () => approvedPost } })
      .overrideProvider(getQueueToken(REMINDER_QUEUE))
      .useValue({ add: jest.fn(), remove: jest.fn() })
      .overrideProvider(ReminderProcessor)
      .useValue({ process: () => Promise.resolve() })
      .overrideProvider(MAIL_TRANSPORTER)
      .useValue({ sendMail: jest.fn() })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .overrideGuard(TenantGuard)
      .useValue(allow)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /api/v1/posts/p1/export returns a well-formed payload', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/posts/p1/export?platform=linkedin')
      .expect(200);
    expect(res.body.postId).toBe('p1');
    expect(res.body.platform).toBe('linkedin');
    expect(res.body.imageUrl).toBe('https://img/p1.png');
    expect(res.body.formattedText).toContain('Hello world');
    expect(res.body.limitMax).toBe(3000);
    expect(res.body.deepLink).toBe('https://www.linkedin.com/feed/?shareActive=true');
  });
});
