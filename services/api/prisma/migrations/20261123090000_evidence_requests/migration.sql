-- Sprint 4: certifier requests for additional evidence, resolved by the customer.
CREATE TABLE "EvidenceRequest" ("id" TEXT NOT NULL,"caseId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"assignmentId" TEXT NOT NULL,"message" TEXT NOT NULL,"kinds" TEXT[],"previousStatus" "CaseStatus" NOT NULL,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"resolvedAt" TIMESTAMP(3),"resolvedBy" TEXT,CONSTRAINT "EvidenceRequest_pkey" PRIMARY KEY ("id"));
CREATE INDEX "EvidenceRequest_caseId_idx" ON "EvidenceRequest"("caseId");
CREATE INDEX "EvidenceRequest_organizationId_idx" ON "EvidenceRequest"("organizationId");
ALTER TABLE "EvidenceRequest" ADD CONSTRAINT "EvidenceRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ApeCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
