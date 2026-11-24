-- Idempotency receipts for property and case creation, scoped to the authorized actor and tenant.
CREATE TABLE "CreationReceipt" (
 "organizationId" TEXT NOT NULL,
 "actorId" TEXT NOT NULL,
 "operation" TEXT NOT NULL,
 "key" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL,
 "resourceId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CreationReceipt_pkey" PRIMARY KEY ("organizationId","actorId","operation","key")
);
