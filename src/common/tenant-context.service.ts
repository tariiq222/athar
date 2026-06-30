import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped tenant context propagated via Node's AsyncLocalStorage.
 *
 * Engine providers (e.g. GptImageProvider) need to record UsageRecord rows
 * with the right `tenantId`, but the seam signature intentionally omits it
 * (per docs/blueprint/16-معمارية-المحرّك.md). PipelineService wraps each
 * per-tenant call in `runWithTenant(tenantId, fn)` so the provider can
 * resolve the active tenant without polluting the seam.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<{ tenantId: string }>();

  /** Run `fn` with `tenantId` available to `getTenantId()` from any awaited code. */
  runWithTenant<T>(tenantId: string, fn: () => Promise<T> | T): Promise<T> | T {
    return this.storage.run({ tenantId }, fn);
  }

  /** Returns the active tenantId, or 'unknown' if no context is set. */
  getTenantId(): string {
    return this.storage.getStore()?.tenantId ?? 'unknown';
  }
}
