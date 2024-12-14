/*
  Warnings:

  - You are about to drop the `LotteryTicket` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "LotteryTicket" DROP CONSTRAINT "LotteryTicket_userId_fkey";

-- DropTable
DROP TABLE "LotteryTicket";
