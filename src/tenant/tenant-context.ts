// Canonical isolation contract — consumed by every authenticated route and every later phase.
export interface TenantContext {
  userId: string;
  tenantId: string;
}
