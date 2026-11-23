-- Provinces served by each certifier (empty = whole region).
ALTER TABLE "Certifier" ADD COLUMN "provinces" TEXT[] DEFAULT ARRAY[]::TEXT[];
