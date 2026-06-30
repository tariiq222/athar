import { Global, Module, OnApplicationBootstrap } from '@nestjs/common';
import { collectDefaultMetrics } from 'prom-client';
import { MetricsController } from './metrics.controller';

/**
 * Wires up the Prometheus metrics endpoint.
 *
 * `collectDefaultMetrics()` registers the standard set of Node.js process
 * metrics (CPU, memory, event-loop lag, GC, file descriptors, etc.) against
 * the default prom-client registry. The endpoint is guarded by ADMIN_TOKEN
 * (see MetricsController) so it is not exposed to anonymous scrapers.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: 'PROMETHEUS_DEFAULT_METRICS',
      useFactory: () => {
        collectDefaultMetrics();
        return true;
      },
    },
  ],
  exports: ['PROMETHEUS_DEFAULT_METRICS'],
})
export class ObservabilityModule implements OnApplicationBootstrap {
  // Reserved for future explicit lifecycle hooks (e.g. pushgateway flush).
  // The default-metrics collector starts the moment the factory runs, so
  // bootstrap here is intentionally empty.
  onApplicationBootstrap(): void {
    // no-op
  }
}