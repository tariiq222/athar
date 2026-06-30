-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "legalBasis" TEXT NOT NULL DEFAULT 'contract',
ADD COLUMN     "retentionUntil" TIMESTAMP(3),
ADD COLUMN     "subtotalMinor" INTEGER,
ADD COLUMN     "taxableAmountMinor" INTEGER,
ADD COLUMN     "vatMinor" INTEGER,
ADD COLUMN     "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consentGivenAt" TIMESTAMP(3),
ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'editor';

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tenantId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_tenantId_createdAt_idx" ON "WebhookEvent"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
