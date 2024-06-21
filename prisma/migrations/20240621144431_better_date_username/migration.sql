/*
  Warnings:

  - You are about to drop the column `date` on the `Username` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Username" RENAME COLUMN "date" TO "createdAt";
ALTER TABLE "Username" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
