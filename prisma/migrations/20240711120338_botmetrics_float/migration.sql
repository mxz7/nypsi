-- DropForeignKey
ALTER TABLE "ChatReactionLeaderboards" DROP CONSTRAINT "ChatReactionLeaderboards_userId_fkey";

-- AlterTable
ALTER TABLE "BotMetrics" ALTER COLUMN "value" SET DATA TYPE DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "ChatReactionLeaderboards" ADD CONSTRAINT "ChatReactionLeaderboards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
