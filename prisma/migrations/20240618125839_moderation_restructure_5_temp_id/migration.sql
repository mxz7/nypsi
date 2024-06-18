/*
  Warnings:

  - The primary key for the `ModerationCase` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The required column `tempId` was added to the `ModerationCase` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "ModerationCase" DROP CONSTRAINT "ModerationCase_pkey",
ADD COLUMN     "tempId" TEXT NOT NULL,
ADD CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("tempId");
