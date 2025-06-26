/*
  Warnings:

  - You are about to alter the column `itemAmount` on the `Market` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable
ALTER TABLE "Market" ALTER COLUMN "itemAmount" SET DATA TYPE INTEGER;
