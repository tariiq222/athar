import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Sprint A — Task 6.1: rawBody: true so the webhook controller can verify
  // HMAC-SHA256 over the exact bytes Moyasar sent. Without it, the JSON
  // parser would re-serialize and the signature would no longer match.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.setGlobalPrefix('api/v1'); // all routes live under /api/v1 (single source of truth)
  // Sprint A — Task 9.1: the global ValidationPipe and the HTTP exception
  // filter are registered as APP_PIPE / APP_FILTER in AppModule, not here.
  // Keeping a single registration site prevents duplicate-pipe/duplicate-filter
  // bugs (each `useGlobalPipes`/`useGlobalFilters` call stacks another instance).
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
