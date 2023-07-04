/*
  Warnings:

  - The primary key for the `Mention` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "Mention" DROP CONSTRAINT "Mention_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Mention_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Mention_id_seq";
