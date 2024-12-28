/*
  Warnings:

  - You are about to drop the column `chatFilter` on the `Guild` table. All the data in the column will be lost.
  - You are about to drop the column `percentMatch` on the `Guild` table. All the data in the column will be lost.
  - You are about to drop the column `totalSpend` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `KofiPurchases` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "KofiPurchases" DROP CONSTRAINT "KofiPurchases_userId_fkey";

-- AlterTable
ALTER TABLE "Guild" DROP COLUMN "chatFilter",
DROP COLUMN "percentMatch";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "totalSpend";

-- DropTable
DROP TABLE "KofiPurchases";
