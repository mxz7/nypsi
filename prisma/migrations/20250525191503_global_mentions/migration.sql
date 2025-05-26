-- DropIndex
DROP INDEX "Mention_guildId_idx";

-- AlterTable
ALTER TABLE "Preferences" ADD COLUMN     "mentionsGlobal" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Mention_targetId_idx" ON "Mention"("targetId");
