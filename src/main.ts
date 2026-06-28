import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1'); // all routes live under /api/v1 (single source of truth)
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();