-- Sprint 4: on-site inspection scheduling and immutable structured report.
CREATE TYPE "InspectionStatus" AS ENUM ('SCHEDULED', 'DONE', 'CANCELLED');
CREATE TABLE "Inspection" ("id" TEXT NOT NULL,"caseId" TEXT NOT NULL,"assignmentId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"status" "InspectionStatus" NOT NULL DEFAULT 'SCHEDULED',"scheduledAt" TIMESTAMP(3) NOT NULL,"performedAt" TIMESTAMP(3),"report" JSONB,"reportSubmittedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Inspection_assignmentId_key" ON "Inspection"("assignmentId");
CREATE INDEX "Inspection_caseId_idx" ON "Inspection"("caseId");
CREATE INDEX "Inspection_organizationId_idx" ON "Inspection"("organizationId");
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ApeCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
