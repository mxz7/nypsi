-- DropForeignKey
ALTER TABLE "AuctionWatch" DROP CONSTRAINT "AuctionWatch_userId_fkey";

-- AddForeignKey
ALTER TABLE "AuctionWatch" ADD CONSTRAINT "AuctionWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
