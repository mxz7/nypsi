/*
  Warnings:

  - The primary key for the `Captcha` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Captcha` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `CarUpgrade` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `CustomCar` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `CustomCar` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `SupportRequestMessage` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `SupportRequestMessage` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `carId` on the `CarUpgrade` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/

DELETE FROM "CarUpgrade";
DELETE FROM "CustomCar";

-- DropForeignKey
ALTER TABLE "CarUpgrade" DROP CONSTRAINT "CarUpgrade_carId_fkey";

-- AlterTable
ALTER TABLE "Captcha" DROP CONSTRAINT "Captcha_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "Captcha_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "CarUpgrade" DROP CONSTRAINT "CarUpgrade_pkey",
DROP COLUMN "carId",
ADD COLUMN     "carId" INTEGER NOT NULL,
ADD CONSTRAINT "CarUpgrade_pkey" PRIMARY KEY ("carId", "type");

-- AlterTable
ALTER TABLE "CustomCar" DROP CONSTRAINT "CustomCar_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "CustomCar_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "SupportRequestMessage" DROP CONSTRAINT "SupportRequestMessage_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "SupportRequestMessage_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "CarUpgrade" ADD CONSTRAINT "CarUpgrade_carId_fkey" FOREIGN KEY ("carId") REFERENCES "CustomCar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
