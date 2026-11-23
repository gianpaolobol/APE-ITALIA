-- Sprint 4: certifier profiles and case assignments (matching workflow).
CREATE TYPE "AssignmentStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');
CREATE TABLE "Certifier" ("id" TEXT NOT NULL,"userSubject" TEXT NOT NULL,"displayName" TEXT NOT NULL,"registrationId" TEXT NOT NULL,"regions" TEXT[],"maxActiveAssignments" INTEGER NOT NULL DEFAULT 5,"active" BOOLEAN NOT NULL DEFAULT true,"verifiedAt" TIMESTAMP(3),"verifiedBy" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Certifier_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Assignment" ("id" TEXT NOT NULL,"caseId" TEXT NOT NULL,"certifierId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"status" "AssignmentStatus" NOT NULL DEFAULT 'OFFERED',"offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"expiresAt" TIMESTAMP(3) NOT NULL,"respondedAt" TIMESTAMP(3),"declineReason" TEXT,CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Certifier_userSubject_key" ON "Certifier"("userSubject");
CREATE UNIQUE INDEX "Assignment_caseId_certifierId_key" ON "Assignment"("caseId","certifierId");
CREATE INDEX "Assignment_certifierId_status_idx" ON "Assignment"("certifierId","status");
CREATE INDEX "Assignment_caseId_idx" ON "Assignment"("caseId");
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ApeCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_certifierId_fkey" FOREIGN KEY ("certifierId") REFERENCES "Certifier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
