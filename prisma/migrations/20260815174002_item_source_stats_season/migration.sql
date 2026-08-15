/*
  Warnings:

  - The primary key for the `ItemSourceStats` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "ItemSourceStats" DROP CONSTRAINT "ItemSourceStats_pkey",
ADD COLUMN     "season" INTEGER NOT NULL DEFAULT 12;

ALTER TABLE "ItemSourceStats" ALTER COLUMN "season" DROP DEFAULT,
ADD CONSTRAINT "ItemSourceStats_pkey" PRIMARY KEY ("itemId", "season", "source");
