import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { RedisHealthIndicator } from './redis-health.indicator';

/**
 * Liveness and readiness probes for orchestrators.
 *
 * /health/live  — plain liveness, returns { status: 'ok' } with no
 *                 dependency calls. Use this for k8s livenessProbe / Docker
 *                 HEALTHCHECK — restarting the pod does not heal Postgres or
 *                 Redis, so a failed liveness must NOT be triggered by an
 *                 external dependency being down.
 *
 * /health/ready — Terminus-orchestrated readiness, pings DB and Redis with
 *                 a 1s timeout each. Use this for k8s readinessProbe — pull
 *                 a pod out of the load-balancer rotation while its
 *                 dependencies are unhealthy.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('db', this.prisma, { timeout: 1000 }),
      () => this.redis.pingCheck('redis', { timeout: 1000 }),
    ]);
  }
}