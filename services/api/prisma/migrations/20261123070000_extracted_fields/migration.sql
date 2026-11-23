-- Sprint 3: AI extraction candidates with provenance, confidence and append-only review history.
CREATE TABLE "ExtractedField" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"caseId" TEXT NOT NULL,"evidenceId" TEXT NOT NULL,"field" TEXT NOT NULL,"value" JSONB NOT NULL,"unit" TEXT,"confidence" DOUBLE PRECISION,"status" TEXT NOT NULL DEFAULT 'needs_review',"modelId" TEXT NOT NULL,"extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"reviewedBy" TEXT,"reviewedAt" TIMESTAMP(3),CONSTRAINT "ExtractedField_pkey" PRIMARY KEY ("id"));
CREATE TABLE "ExtractedFieldRevision" ("id" TEXT NOT NULL,"extractedFieldId" TEXT NOT NULL,"action" TEXT NOT NULL,"previousValue" JSONB,"newValue" JSONB,"actor" TEXT NOT NULL,"note" TEXT,"at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ExtractedFieldRevision_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ExtractedField_evidenceId_field_modelId_key" ON "ExtractedField"("evidenceId","field","modelId");
CREATE INDEX "ExtractedField_caseId_idx" ON "ExtractedField"("caseId");
CREATE INDEX "ExtractedField_organizationId_idx" ON "ExtractedField"("organizationId");
CREATE INDEX "ExtractedFieldRevision_extractedFieldId_idx" ON "ExtractedFieldRevision"("extractedFieldId");
ALTER TABLE "ExtractedField" ADD CONSTRAINT "ExtractedField_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ApeCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExtractedField" ADD CONSTRAINT "ExtractedField_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExtractedFieldRevision" ADD CONSTRAINT "ExtractedFieldRevision_extractedFieldId_fkey" FOREIGN KEY ("extractedFieldId") REFERENCES "ExtractedField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
