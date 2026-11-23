-- Sprint 4: evidence metadata for encrypted private storage, and versioned consent records.
-- Evidence previously had no upload path; existing development rows (if any) cannot satisfy the new NOT NULL columns.
DELETE FROM "Evidence";
ALTER TABLE "Evidence" ADD COLUMN "organizationId" TEXT NOT NULL,
ADD COLUMN "mimeType" TEXT NOT NULL,
ADD COLUMN "sizeBytes" INTEGER NOT NULL,
ADD COLUMN "sha256" TEXT NOT NULL,
ADD COLUMN "uploadedBy" TEXT NOT NULL,
ADD COLUMN "scanStatus" TEXT NOT NULL DEFAULT 'unscanned';
CREATE TABLE "Consent" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"caseId" TEXT NOT NULL,"subject" TEXT NOT NULL,"kind" TEXT NOT NULL,"version" TEXT NOT NULL,"acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Consent_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Evidence_storageKey_key" ON "Evidence"("storageKey");
CREATE UNIQUE INDEX "Evidence_caseId_sha256_key" ON "Evidence"("caseId","sha256");
CREATE INDEX "Evidence_organizationId_idx" ON "Evidence"("organizationId");
CREATE UNIQUE INDEX "Consent_caseId_subject_kind_version_key" ON "Consent"("caseId","subject","kind","version");
CREATE INDEX "Consent_organizationId_idx" ON "Consent"("organizationId");
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ApeCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
