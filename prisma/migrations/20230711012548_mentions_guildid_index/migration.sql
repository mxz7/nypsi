-- DropForeignKey
ALTER TABLE "Leaderboards" DROP CONSTRAINT "Leaderboards_userId_fkey";

-- CreateIndex
CREATE INDEX "Mention_guildId_idx" ON "Mention"("guildId");

-- AddForeignKey
ALTER TABLE "Leaderboards" ADD CONSTRAINT "Leaderboards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
