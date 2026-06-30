import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler guard that scopes the rate-limit tracker to the active tenant
 * when available, falling back to the request IP otherwise.
 *
 * Why: a single corporate IP can host many tenants (e.g. office NAT,
 * shared mobile carrier). Limiting by IP alone would let one tenant's
 * burst starve another tenant's legitimate traffic. When a request has
 * a resolved tenant context (e.g. behind JwtAuthGuard), we key the
 * counter on the tenantId instead so each tenant gets its own bucket.
 *
 * Sprint A — Task 10.1. Applied per-route (not global) so Task 13.1
 * can re-shape wiring without ripping out a global APP_GUARD.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  /**
   * Returns the tracker key for the throttler storage.
   * Priority: explicit tenantContext.tenantId -> req.ip.
   */
  protected async getTracker(req: {
    tenantContext?: { tenantId?: unknown };
    ip?: string;
  }): Promise<string> {
    const tenantId = req?.tenantContext?.tenantId;
    if (typeof tenantId === 'string' && tenantId.length > 0) {
      return tenantId;
    }
    return req?.ip ?? 'unknown';
  }
}
