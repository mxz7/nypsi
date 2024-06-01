-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "prefixes" TEXT[] DEFAULT ARRAY['$']::TEXT[];
