/*
  Warnings:

  - Made the column `caseId_new` on table `ModerationCase` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ModerationCase" ALTER COLUMN "caseId_new" SET NOT NULL;
