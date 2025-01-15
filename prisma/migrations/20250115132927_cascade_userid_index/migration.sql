-- DropForeignKey
ALTER TABLE "WordleGame" DROP CONSTRAINT "WordleGame_userId_fkey";

-- CreateIndex
CREATE INDEX "WordleGame_userId_idx" ON "WordleGame"("userId");

-- AddForeignKey
ALTER TABLE "WordleGame" ADD CONSTRAINT "WordleGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
