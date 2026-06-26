-- CreateEnum
CREATE TYPE "LotteryType" AS ENUM ('standard', 'superdraw');

-- CreateEnum
CREATE TYPE "LotteryAutoBuy" AS ENUM ('daily', 'lottery');

-- AlterTable
ALTER TABLE "Economy" RENAME COLUMN "dailyLottery" TO "autobuyLotteryTicketsAmount";

-- AlterTable
ALTER TABLE "Economy" ADD COLUMN "autobuyLotteryTicketsTime" "LotteryAutoBuy";

-- CreateTable
CREATE TABLE "Lottery" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "LotteryType" NOT NULL DEFAULT 'standard',
    "winnerId" TEXT,
    "winnerTickets" BIGINT NOT NULL,
    "totalTickets" BIGINT NOT NULL,

    CONSTRAINT "Lottery_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Lottery" ADD CONSTRAINT "Lottery_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
