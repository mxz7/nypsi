-- AlterTable
ALTER TABLE "KofiPurchases" ADD COLUMN     "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "KofiPurchases" ADD CONSTRAINT "KofiPurchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;