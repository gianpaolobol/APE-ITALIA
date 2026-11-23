-- Optional pre-inspection video call on accepted assignments.
ALTER TABLE "Assignment" ADD COLUMN "callAt" TIMESTAMP(3), ADD COLUMN "callUrl" TEXT;
