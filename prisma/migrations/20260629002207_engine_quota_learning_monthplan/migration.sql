-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "monthPlanId" TEXT,
ADD COLUMN     "originalText" TEXT,
ADD COLUMN     "quotaStatus" TEXT NOT NULL DEFAULT 'ok';

-- CreateTable
CREATE TABLE "MonthPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skippedQuota" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthPlan_tenantId_idx" ON "MonthPlan"("tenantId");

-- CreateIndex
CREATE INDEX "Post_monthPlanId_idx" ON "Post"("monthPlanId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_monthPlanId_fkey" FOREIGN KEY ("monthPlanId") REFERENCES "MonthPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
