-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "latestActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
