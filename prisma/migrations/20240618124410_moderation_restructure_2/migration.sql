/*
  Warnings:

  - You are about to drop the `Moderation` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `caseId_new` to the `ModerationCase` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Moderation" DROP CONSTRAINT "Moderation_guildId_fkey";

-- DropForeignKey
ALTER TABLE "ModerationBan" DROP CONSTRAINT "ModerationBan_guildId_fkey";

-- DropForeignKey
ALTER TABLE "ModerationCase" DROP CONSTRAINT "ModerationCase_guildId_fkey";

-- DropForeignKey
ALTER TABLE "ModerationMute" DROP CONSTRAINT "ModerationMute_guildId_fkey";

-- AlterTable
ALTER TABLE "ModerationCase" ADD COLUMN     "caseId_new" INTEGER NOT NULL,
ALTER COLUMN "time" SET DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "Moderation";

-- AddForeignKey
ALTER TABLE "ModerationBan" ADD CONSTRAINT "ModerationBan_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationMute" ADD CONSTRAINT "ModerationMute_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
