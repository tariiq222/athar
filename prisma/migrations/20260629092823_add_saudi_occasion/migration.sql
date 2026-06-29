-- CreateTable
CREATE TABLE "SaudiOccasion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "hijriYear" INTEGER NOT NULL,
    "gregorianYear" INTEGER NOT NULL,

    CONSTRAINT "SaudiOccasion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaudiOccasion_tenantId_startDate_endDate_idx" ON "SaudiOccasion"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "SaudiOccasion_gregorianYear_idx" ON "SaudiOccasion"("gregorianYear");

-- CreateIndex
CREATE UNIQUE INDEX "SaudiOccasion_tenantId_slug_gregorianYear_key" ON "SaudiOccasion"("tenantId", "slug", "gregorianYear");
