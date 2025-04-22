/*
  Warnings:

  - You are about to drop the `Auction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Auction" DROP CONSTRAINT "Auction_ownerId_fkey";

-- DropTable
DROP TABLE "Auction";

-- RenameTable
ALTER TABLE "AuctionWatch" RENAME TO "MarketWatch";

-- CreateTable
CREATE TABLE "MarketBuyOrder" (
    "id" SERIAL NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemAmount" BIGINT NOT NULL DEFAULT 1,
    "price" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MarketBuyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSellOrder" (
    "id" SERIAL NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemAmount" BIGINT NOT NULL DEFAULT 1,
    "price" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MarketSellOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketBuyOrder_itemId_idx" ON "MarketBuyOrder"("itemId");

-- CreateIndex
CREATE INDEX "MarketSellOrder_itemId_idx" ON "MarketSellOrder"("itemId");

-- AddForeignKey
ALTER TABLE "MarketBuyOrder" ADD CONSTRAINT "MarketBuyOrder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSellOrder" ADD CONSTRAINT "MarketSellOrder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
