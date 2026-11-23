-- Sprint 4: one-time organization invitations (hash-only storage of codes).
CREATE TABLE "Invitation" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"codeHash" TEXT NOT NULL,"role" TEXT NOT NULL,"createdBy" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"acceptedBy" TEXT,"acceptedAt" TIMESTAMP(3),"revokedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Invitation_codeHash_key" ON "Invitation"("codeHash");
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
