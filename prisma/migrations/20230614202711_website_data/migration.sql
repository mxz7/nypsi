-- AlterTable
ALTER TABLE "EconomyGuild" ALTER COLUMN "xp" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "badges" TEXT[];

-- CreateTable
CREATE TABLE "Leaderboards" (
    "userId" TEXT NOT NULL,
    "leaderboard" TEXT NOT NULL,
    "position" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "Leaderboards_userId_idx" ON "Leaderboards"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Leaderboards_leaderboard_position_key" ON "Leaderboards"("leaderboard", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Leaderboards_userId_leaderboard_key" ON "Leaderboards"("userId", "leaderboard");

-- AddForeignKey
ALTER TABLE "Leaderboards" ADD CONSTRAINT "Leaderboards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
