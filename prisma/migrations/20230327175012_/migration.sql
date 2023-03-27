-- AlterTable
ALTER TABLE "Auction" ALTER COLUMN "itemAmount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "DMSettings" ADD COLUMN     "autosellStatus" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Economy" ADD COLUMN     "autosell" TEXT[],
ADD COLUMN     "offersBlock" TEXT[];

-- AlterTable
ALTER TABLE "Preferences" ADD COLUMN     "offers" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "Offer" (
    "ownerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemAmount" BIGINT NOT NULL DEFAULT 1,
    "money" BIGINT NOT NULL,
    "messageId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_messageId_key" ON "Offer"("messageId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
