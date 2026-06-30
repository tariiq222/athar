import { Logger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { initSentry } from './observability/sentry';

async function bootstrap() {
  // Sprint A — Task 13.1: Sentry must init BEFORE NestFactory.create so
  // its GlobalErrorHandler is in the chain before the first request lands.
  // No-op when SENTRY_DSN is unset (see ./observability/sentry.ts).
  initSentry();

  // Sprint A — Task 6.1: rawBody: true so the webhook controller can verify
  // HMAC-SHA256 over the exact bytes Moyasar sent. Without it, the JSON
  // parser would re-serialize and the signature would no longer match.
  //
  // Sprint A — Task 13.1: bufferLogs: true routes Nest's internal bootstrap
  // logs through the pino logger configured in AppModule (LoggerModule),
  // instead of the default console logger — so the very first log line is
  // already structured JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  app.setGlobalPrefix('api/v1'); // all routes live under /api/v1 (single source of truth)
  // Sprint A — Task 13.1: bind the pino Logger to Nest so every controller,
  // service and exception filter logs through the same structured pipeline.
  app.useLogger(app.get(Logger));
  // Sprint A — Task 13.1: helmet sets sensible security headers
  // (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  // Strict-Transport-Security, etc.). It is a global middleware and
  // intentionally NOT route-scoped — there is no endpoint that needs
  // weaker defaults.
  app.use(helmet());
  // auth-session-hardening: cookie-parser must run before the SessionMiddleware
  // and the CsrfGuard so that req.cookies is populated (session_token, csrf_token).
  app.use(cookieParser());
  // Sprint A — Task 13.1: CORS allow-list driven by env. Empty list = same
  // origin only (no Access-Control-Allow-Origin). credentials: true allows
  // the Sanctum-style cookie flow the web client may use.
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? [],
    credentials: true,
  });
  // Sprint A — Task 13.1: enable graceful shutdown so SIGTERM/SIGINT close
  // the HTTP server, BullMQ workers and Prisma connections cleanly. Required
  // for orchestrator-driven rolling restarts to drain in-flight requests.
  app.enableShutdownHooks();
  // Sprint A — Task 9.1: the global ValidationPipe and the HTTP exception
  // filter are registered as APP_PIPE / APP_FILTER in AppModule, not here.
  // Keeping a single registration site prevents duplicate-pipe/duplicate-filter
  // bugs (each `useGlobalPipes`/`useGlobalFilters` call stacks another instance).
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();