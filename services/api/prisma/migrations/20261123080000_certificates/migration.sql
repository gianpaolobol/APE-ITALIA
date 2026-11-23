-- Sprint 4: storage and delivery of the APE signed and deposited by the certifier.
CREATE TABLE "Certificate" ("id" TEXT NOT NULL,"caseId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"certifierId" TEXT NOT NULL,"storageKey" TEXT NOT NULL,"sha256" TEXT NOT NULL,"sizeBytes" INTEGER NOT NULL,"scanStatus" TEXT NOT NULL DEFAULT 'unscanned',"regionalId" TEXT NOT NULL,"depositedAt" TIMESTAMP(3) NOT NULL,"validUntil" TIMESTAMP(3),"uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"deliveredAt" TIMESTAMP(3),"deliveredTo" TEXT,CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Certificate_caseId_key" ON "Certificate"("caseId");
CREATE UNIQUE INDEX "Certificate_storageKey_key" ON "Certificate"("storageKey");
CREATE INDEX "Certificate_organizationId_idx" ON "Certificate"("organizationId");
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ApeCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
