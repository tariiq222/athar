import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import IORedis, { Redis } from 'ioredis';

/**
 * Terminus health indicator for Redis.
 *
 * The standard @nestjs/terminus package ships indicators for TypeORM, Prisma,
 * Mongoose, MikroORM, Sequelize, microservices, gRPC, HTTP, memory and disk,
 * but NOT for a raw Redis connection. We talk to Redis directly via ioredis
 * (already a project dependency — BullMQ uses it) with a strict timeout.
 *
 * Connection params come from REDIS_HOST / REDIS_PORT (matches BullModule
 * wiring in app.module.ts). Reusing Bull's connection would couple health to
 * the queue lifecycle; a fresh client keeps readiness independent.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  async pingCheck(key: string, options: { timeout?: number } = {}): Promise<HealthIndicatorResult> {
    const timeout = options.timeout ?? 1000;
    const host = process.env.REDIS_HOST ?? 'localhost';
    const port = Number(process.env.REDIS_PORT ?? 6379);
    const client: Redis = new IORedis({
      host,
      port,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: timeout,
    });

    try {
      const pong = await Promise.race([
        client.connect().then(() => client.ping()),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('redis ping timeout')), timeout),
        ),
      ]);
      const isHealthy = pong === 'PONG';
      const result = this.getStatus(key, isHealthy, { response: pong });
      if (!isHealthy) {
        throw new HealthCheckError('Redis ping failed', result);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HealthCheckError('Redis ping failed', this.getStatus(key, false, { message }));
    } finally {
      client.disconnect();
    }
  }
}
