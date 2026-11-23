-- Customer payments (Stripe Checkout).
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');
CREATE TABLE "Payment" ("id" TEXT NOT NULL,"caseId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"amountCents" INTEGER NOT NULL,"currency" TEXT NOT NULL DEFAULT 'eur',"status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',"stripeSessionId" TEXT,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"paidAt" TIMESTAMP(3),CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");
CREATE INDEX "Payment_caseId_idx" ON "Payment"("caseId");
