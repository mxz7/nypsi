-- DropIndex
DROP INDEX "Game_userId_idx";

-- CreateIndex
CREATE INDEX "Game_userId_game_idx" ON "Game"("userId", "game");
