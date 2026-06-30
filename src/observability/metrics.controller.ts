import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { register } from 'prom-client';

/**
 * Prometheus scrape endpoint, guarded by a shared admin token.
 *
 * Intentionally NOT registered under /api/v1 — scrapers (Prometheus, Grafana
 * Agent) expect /metrics at the root path, and this endpoint is not for
 * application clients.
 */
@Controller('metrics')
export class MetricsController {
  @Get()
  metrics(
    @Headers('x-admin-token') token: string | undefined,
  ): Promise<string> {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected || token !== expected) {
      // Synchronous throw so the guard fires before any I/O. Nest will
      // turn this into a 401 response; tests can also catch it directly.
      throw new UnauthorizedException('Invalid or missing admin token');
    }
    return register.metrics();
  }
}