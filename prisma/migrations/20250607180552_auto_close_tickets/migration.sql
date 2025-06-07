/*
  Warnings:

  - Added the required column `latestActivity` to the `SupportRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "latestActivity" TIMESTAMP(3) NOT NULL;
