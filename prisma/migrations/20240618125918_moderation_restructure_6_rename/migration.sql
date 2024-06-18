
-- AlterTable
ALTER TABLE "ModerationCase" RENAME COLUMN "caseId" TO "caseId_old";
ALTER TABLE "ModerationCase" RENAME COLUMN "caseId_new" TO "caseId";
