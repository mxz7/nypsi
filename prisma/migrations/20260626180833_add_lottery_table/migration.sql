/*
  Warnings:

  - You are about to drop the column `dailyLottery` on the `Economy` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "LotteryType" AS ENUM ('standard', 'superdraw');

-- CreateEnum
CREATE TYPE "LotteryAutoBuy" AS ENUM ('daily', 'lottery');

-- AlterTable
ALTER TABLE "Economy" DROP COLUMN "dailyLottery",
ADD COLUMN     "autobuyLotteryTicketsAmount" INTEGER,
ADD COLUMN     "autobuyLotteryTicketsTime" "LotteryAutoBuy";

-- Backfill existing autobuy users to the previous behavior (daily)
UPDATE "Economy"
SET "autobuyLotteryTicketsTime" = 'daily'
WHERE "autobuyLotteryTicketsAmount" IS NOT NULL AND "autobuyLotteryTicketsAmount" > 0;
-- CreateTable
CREATE TABLE "Lottery" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "LotteryType" NOT NULL DEFAULT 'standard',
    "winnerId" TEXT,
    "winnerTickets" BIGINT NOT NULL,
    "totalTickets" BIGINT NOT NULL,
    "totalWin" BIGINT,

    CONSTRAINT "Lottery_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Lottery" ADD CONSTRAINT "Lottery_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
