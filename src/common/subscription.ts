/**
 * Shared accessor for "the tenant's most recent subscription row".
 *
 * The pattern `subscription.findFirst({ where: { tenantId }, orderBy: {
 * createdAt: 'desc' } })` was duplicated across billing / usage / user. This
 * collapses the exact-match cases into one call while staying behavior-
 * identical:
 *   - `extraWhere` is spread into `where` AFTER `{ tenantId }`, so a caller can
 *     add filters (e.g. `{ status: { not: 'canceled' } }`) without changing the
 *     ordering semantics.
 *   - `select` is passed straight through for callers that project columns.
 *
 * The client is typed structurally (only `subscription.findFirst` is needed),
 * so it accepts both the root `PrismaService` and a `$transaction` client, and
 * keeps this helper decoupled from Prisma's generated row types — matching the
 * recorder's deliberate avoidance of importing the generated client.
 */
export interface SubscriptionFindFirstClient {
  subscription: {
    findFirst: (args: {
      where: Record<string, unknown>;
      orderBy: { createdAt: 'desc' };
      select?: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}

export function latestSubscription<T = unknown>(
  client: SubscriptionFindFirstClient,
  tenantId: string,
  options?: {
    extraWhere?: Record<string, unknown>;
    select?: Record<string, unknown>;
  },
): Promise<T | null> {
  return client.subscription.findFirst({
    where: { tenantId, ...(options?.extraWhere ?? {}) },
    orderBy: { createdAt: 'desc' },
    ...(options?.select ? { select: options.select } : {}),
  }) as Promise<T | null>;
}
