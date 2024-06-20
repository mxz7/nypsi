/*
  Warnings:

  - The primary key for the `ModerationCase` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropIndex
DROP INDEX "Achievements_userId_idx";

-- DropIndex
DROP INDEX "CommandUse_userId_idx";

-- DropIndex
DROP INDEX "Inventory_userId_idx";

-- DropIndex
DROP INDEX "ModerationCase_guildId_idx";

-- DropForeignKey
ALTER TABLE "ModerationEvidence" DROP CONSTRAINT "ModerationEvidence_caseId_guildId_fkey";

-- AlterTable
ALTER TABLE "ModerationCase" DROP CONSTRAINT "ModerationCase_pkey",
ADD CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("guildId", "caseId");

-- AddForeignKey
ALTER TABLE "ModerationEvidence" ADD CONSTRAINT "ModerationEvidence_caseId_guildId_fkey" FOREIGN KEY ("caseId", "guildId") REFERENCES "ModerationCase"("caseId", "guildId") ON DELETE RESTRICT ON UPDATE CASCADE;