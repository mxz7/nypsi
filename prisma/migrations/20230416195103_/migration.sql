-- DropForeignKey
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_targetId_fkey";

-- AlterTable
ALTER TABLE "Offer" ALTER COLUMN "ownerId" DROP NOT NULL,
ALTER COLUMN "targetId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Economy"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Economy"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
