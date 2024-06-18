-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "automute" INTEGER[] DEFAULT ARRAY[0, 60, 120, 300]::INTEGER[],
ADD COLUMN     "logs" TEXT,
ADD COLUMN     "modlogs" TEXT,
ADD COLUMN     "muteRole" TEXT;
