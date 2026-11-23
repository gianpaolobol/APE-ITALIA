-- Resumable uploads of large evidence files.
CREATE TABLE "ChunkedUpload" ("id" TEXT NOT NULL,"caseId" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"kind" TEXT NOT NULL,"totalBytes" INTEGER NOT NULL,"partSize" INTEGER NOT NULL,"receivedParts" INTEGER[],"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3),"evidenceId" TEXT,CONSTRAINT "ChunkedUpload_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ChunkedUpload_caseId_idx" ON "ChunkedUpload"("caseId");
