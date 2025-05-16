-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('buy', 'sell');

-- AlterTable
ALTER TABLE "DMSettings" RENAME COLUMN "auction" TO "market";

-- AlterTable
ALTER TABLE "Preferences" RENAME COLUMN "auctionConfirm" TO "marketConfirm";
ALTER TABLE "Preferences" ALTER COLUMN "marketConfirm" SET DATA TYPE BIGINT;

-- CreateTable
CREATE TABLE "MarketWatch" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "priceThreshold" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "MarketWatch_pkey" PRIMARY KEY ("userId","itemId","orderType")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" SERIAL NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemAmount" BIGINT NOT NULL DEFAULT 1,
    "price" BIGINT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Market_itemId_idx" ON "Market"("itemId");

-- CreateIndex
CREATE INDEX "Market_ownerId_idx" ON "Market"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Market_messageId_key" ON "Market"("messageId");

-- AddForeignKey
ALTER TABLE "MarketWatch" ADD CONSTRAINT "MarketWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
