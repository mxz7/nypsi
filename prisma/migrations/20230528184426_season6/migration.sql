/*
  Warnings:

  - You are about to drop the column `auctionWatch` on the `Economy` table. All the data in the column will be lost.
  - You are about to drop the `ItemUse` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ItemUse" DROP CONSTRAINT "ItemUse_userId_fkey";

-- DropIndex
DROP INDEX "Inventory_userId_item_idx";

-- AlterTable
ALTER TABLE "Economy" DROP COLUMN "auctionWatch";

-- AlterTable
ALTER TABLE "EconomyGuild" ADD COLUMN     "tokens" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Preferences" ADD COLUMN     "leaderboards" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "ItemUse";

-- CreateTable
CREATE TABLE "AuctionWatch" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "maxCost" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "AuctionWatch_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "Stats" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "Stats_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "EconomyGuildUpgrades" (
    "guildName" TEXT NOT NULL,
    "upgradeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "EconomyGuildUpgrades_pkey" PRIMARY KEY ("guildName","upgradeId")
);

-- CreateIndex
CREATE INDEX "Game_userId_idx" ON "Game"("userId");

-- CreateIndex
CREATE INDEX "Inventory_userId_idx" ON "Inventory"("userId");

-- AddForeignKey
ALTER TABLE "AuctionWatch" ADD CONSTRAINT "AuctionWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stats" ADD CONSTRAINT "Stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyGuildUpgrades" ADD CONSTRAINT "EconomyGuildUpgrades_guildName_fkey" FOREIGN KEY ("guildName") REFERENCES "EconomyGuild"("guildName") ON DELETE CASCADE ON UPDATE CASCADE;
