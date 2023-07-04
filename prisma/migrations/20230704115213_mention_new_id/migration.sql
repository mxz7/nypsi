/*
  Warnings:

  - The primary key for the `Mention` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "Mention" DROP CONSTRAINT "Mention_pkey",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Mention_pkey" PRIMARY KEY ("id");
