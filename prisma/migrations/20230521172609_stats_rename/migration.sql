/*
  Warnings:

  - You are about to drop the `ItemUse` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ItemUse" DROP CONSTRAINT "ItemUse_userId_fkey";

-- DropTable
DROP TABLE "ItemUse";

-- CreateTable
CREATE TABLE "Stats" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "Stats_pkey" PRIMARY KEY ("userId","itemId")
);

-- AddForeignKey
ALTER TABLE "Stats" ADD CONSTRAINT "Stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
