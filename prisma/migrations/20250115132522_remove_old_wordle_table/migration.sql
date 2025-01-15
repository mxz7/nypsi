/*
  Warnings:

  - You are about to drop the `WordleStats` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "WordleStats" DROP CONSTRAINT "WordleStats_userId_fkey";

-- DropTable
DROP TABLE "WordleStats";
