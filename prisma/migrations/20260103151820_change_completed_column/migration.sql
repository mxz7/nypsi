/*
  Warnings:

  - You are about to drop the column `completed` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `Event` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" DROP COLUMN "completed",
ADD COLUMN     "endedAt" TIMESTAMP(3);

-- UpdateTable
UPDATE "Event"
SET "endedAt" = COALESCE("completedAt", "expiresAt");

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "completedAt";