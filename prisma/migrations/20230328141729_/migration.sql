/*
  Warnings:

  - The primary key for the `GraphMetrics` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "GraphMetrics" DROP CONSTRAINT "GraphMetrics_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "GraphMetrics_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "GraphMetrics_id_seq";
