/*
  Warnings:

  - You are about to drop the `Auction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuctionWatch` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Auction" DROP CONSTRAINT "Auction_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "AuctionWatch" DROP CONSTRAINT "AuctionWatch_userId_fkey";

-- DropTable
DROP TABLE "Auction";

-- DropTable
DROP TABLE "AuctionWatch";
