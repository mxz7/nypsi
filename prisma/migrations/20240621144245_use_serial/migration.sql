/*
  Warnings:

  - The primary key for the `Booster` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Booster` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Crafting` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Crafting` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `GraphMetrics` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `GraphMetrics` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `KofiPurchases` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `KofiPurchases` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Mention` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Mention` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `ProfileView` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `ProfileView` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Username` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Username` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Booster" DROP CONSTRAINT "Booster_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Booster_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Crafting" DROP CONSTRAINT "Crafting_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Crafting_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "GraphMetrics" DROP CONSTRAINT "GraphMetrics_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD CONSTRAINT "GraphMetrics_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "KofiPurchases" DROP CONSTRAINT "KofiPurchases_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "KofiPurchases_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Mention" DROP CONSTRAINT "Mention_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD CONSTRAINT "Mention_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ProfileView" DROP CONSTRAINT "ProfileView_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Username" DROP CONSTRAINT "Username_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Username_pkey" PRIMARY KEY ("id");
