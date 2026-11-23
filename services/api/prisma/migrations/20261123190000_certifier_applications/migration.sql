-- Certifier self-registration with mandatory SACE accreditation number (Emilia-Romagna).
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "CertifierApplication" ("id" TEXT NOT NULL,"firstName" TEXT NOT NULL,"lastName" TEXT NOT NULL,"email" TEXT NOT NULL,"phone" TEXT NOT NULL,"pec" TEXT,"vatNumber" TEXT NOT NULL,"taxCode" TEXT NOT NULL,"profession" TEXT NOT NULL,"professionalOrder" TEXT NOT NULL,"orderNumber" TEXT NOT NULL,"region" TEXT NOT NULL,"saceNumber" TEXT NOT NULL,"provinces" TEXT[],"status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"reviewedAt" TIMESTAMP(3),"reviewedBy" TEXT,"reviewNote" TEXT,CONSTRAINT "CertifierApplication_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "CertifierApplication_email_key" ON "CertifierApplication"("email");
CREATE UNIQUE INDEX "CertifierApplication_saceNumber_key" ON "CertifierApplication"("saceNumber");
