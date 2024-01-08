/*
  Warnings:

  - You are about to drop the column `status` on the `Premium` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Premium" DROP COLUMN "status",
ADD COLUMN     "credit" INTEGER NOT NULL DEFAULT 0;
