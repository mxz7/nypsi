/*
  Warnings:

  - The primary key for the `Auction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Auction` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `earned` on table `Game` required. This step will fail if there are existing NULL values in that column.
  - Made the column `xpEarned` on table `Game` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Auction" DROP CONSTRAINT "Auction_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Auction_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "earned" SET NOT NULL,
ALTER COLUMN "earned" SET DEFAULT 0,
ALTER COLUMN "xpEarned" SET NOT NULL,
ALTER COLUMN "xpEarned" SET DEFAULT 0;
