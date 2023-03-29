-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "sold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "soldAt" TIMESTAMP(3);
