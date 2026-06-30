import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  tenantId: string;
  userId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

// Sprint A — Task 4.1: append-only audit log for security/PDPL events.
// Kept as a thin wrapper around Prisma so callers don't need to know the
// model name and so future cross-cutting concerns (batching, retries,
// shipping to a separate analytics store) have a single seam.
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    const { metadata, ...rest } = entry;
    await this.prisma.auditLog.create({
      data: {
        ...rest,
        userId: entry.userId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        // Prisma's Json field type rejects `undefined` but accepts `null` and
        // objects; only spread metadata when it's actually provided.
        ...(metadata !== undefined ? { metadata: metadata as any } : {}),
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt: new Date(),
      },
    });
  }
}