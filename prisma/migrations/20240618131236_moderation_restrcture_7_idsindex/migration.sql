/*
  Warnings:

  - The primary key for the `ModerationCase` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `tempId` on the `ModerationCase` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ModerationCase" DROP CONSTRAINT "ModerationCase_pkey",
DROP COLUMN "tempId",
ADD CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("caseId", "guildId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_idx" ON "ModerationCase"("guildId");
