/*
  Warnings:

  - You are about to drop the `WholesomeImage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WholesomeSuggestion` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ImageType" AS ENUM ('cat', 'dog', 'capybara', 'wholesome');

-- DropTable
DROP TABLE "WholesomeImage";

-- DropTable
DROP TABLE "WholesomeSuggestion";

-- CreateTable
CREATE TABLE "Image" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "type" "ImageType" NOT NULL,
    "uploaderId" TEXT,
    "accepterId" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageSuggestion" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "type" "ImageType" NOT NULL,
    "uploaderId" TEXT NOT NULL,

    CONSTRAINT "ImageSuggestion_pkey" PRIMARY KEY ("id")
);
