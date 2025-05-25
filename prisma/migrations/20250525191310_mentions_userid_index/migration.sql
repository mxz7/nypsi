-- DropIndex
DROP INDEX "Mention_guildId_idx";

-- CreateIndex
CREATE INDEX "Mention_targetId_idx" ON "Mention"("targetId");
