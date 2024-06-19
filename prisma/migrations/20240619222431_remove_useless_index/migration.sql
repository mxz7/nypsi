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

-- AlterTable
ALTER TABLE "ModerationCase" DROP CONSTRAINT "ModerationCase_pkey",
ADD CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("guildId", "caseId");
