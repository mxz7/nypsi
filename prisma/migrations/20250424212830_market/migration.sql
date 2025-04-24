-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('buy', 'sell');

-- CreateTable
CREATE TABLE "MarketWatch" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "priceThreshold" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "MarketWatch_pkey" PRIMARY KEY ("userId","itemId","orderType")
);

-- CreateTable
CREATE TABLE "MarketOrder" (
    "id" SERIAL NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemAmount" BIGINT NOT NULL DEFAULT 1,
    "price" BIGINT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketOrder_itemId_idx" ON "MarketOrder"("itemId");

-- AddForeignKey
ALTER TABLE "MarketWatch" ADD CONSTRAINT "MarketWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
