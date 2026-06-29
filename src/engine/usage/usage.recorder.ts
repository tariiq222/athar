/**
 * Stub UsageRecorder — minimal interface so Task 7 (LiveSearchProvider) can
 * import a concrete type. Task 8 fleshes this out (real DB writes + quota
 * check); callers may already inject and call `.record()`.
 */
export interface UsageRecordInput {
  tenantId: string;
  kind: 'text' | 'image' | 'search';
  units: number;
  costUsd?: number;
}

export class UsageRecorder {
  async record(_input: UsageRecordInput): Promise<void> {
    // Intentionally empty — Task 8 implements the DB-backed version.
  }
}