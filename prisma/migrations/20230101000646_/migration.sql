/*
  Warnings:

  - You are about to drop the column `itemName` on the `Auction` table. All the data in the column will be lost.
  - You are about to drop the column `net_worth` on the `DMSettings` table. All the data in the column will be lost.
  - You are about to drop the column `vote_reminder` on the `DMSettings` table. All the data in the column will be lost.
  - You are about to drop the column `auction_watch` on the `Economy` table. All the data in the column will be lost.
  - You are about to drop the column `net_worth` on the `Economy` table. All the data in the column will be lost.
  - You are about to drop the `EconomyStats` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `itemId` to the `Auction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Auction" DROP CONSTRAINT "Auction_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EconomyGuild" DROP CONSTRAINT "EconomyGuild_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "EconomyGuildMember" DROP CONSTRAINT "EconomyGuildMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "EconomyStats" DROP CONSTRAINT "EconomyStats_economyUserId_fkey";

-- DropIndex
DROP INDEX "Mention_guildId_idx";

-- AlterTable
ALTER TABLE "Auction" DROP COLUMN "itemName",
ADD COLUMN     "itemId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "DMSettings" DROP COLUMN "net_worth",
DROP COLUMN "vote_reminder",
ADD COLUMN     "netWorth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voteReminder" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Economy" DROP COLUMN "auction_watch",
DROP COLUMN "net_worth",
ADD COLUMN     "auctionWatch" TEXT[],
ADD COLUMN     "lastBake" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 14:21:00 +02:00',
ADD COLUMN     "netWorth" BIGINT NOT NULL DEFAULT 0,
ALTER COLUMN "lastVote" SET DEFAULT '1970-01-01 14:21:00 +02:00';

-- AlterTable
ALTER TABLE "Inventory" ALTER COLUMN "amount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "ReactionRole" ADD COLUMN     "color" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blacklisted" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "EconomyStats";

-- CreateTable
CREATE TABLE "BakeryUpgrade" (
    "userId" TEXT NOT NULL,
    "upgradeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "BakeryUpgrade_pkey" PRIMARY KEY ("userId","upgradeId")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "game" TEXT NOT NULL,
    "win" INTEGER NOT NULL,
    "bet" BIGINT NOT NULL,
    "earned" BIGINT,
    "xpEarned" INTEGER,
    "outcome" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemUse" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "ItemUse_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "GraphMetrics" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphMetrics_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BakeryUpgrade" ADD CONSTRAINT "BakeryUpgrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemUse" ADD CONSTRAINT "ItemUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyGuild" ADD CONSTRAINT "EconomyGuild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyGuildMember" ADD CONSTRAINT "EconomyGuildMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
