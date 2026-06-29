-- Phase 6 — billing. Adds Invoice table.
CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "moyasarPaymentId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'SAR',
  "sellerName" TEXT NOT NULL,
  "buyerName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'issued',
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_moyasarPaymentId_key" ON "Invoice"("moyasarPaymentId");
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;