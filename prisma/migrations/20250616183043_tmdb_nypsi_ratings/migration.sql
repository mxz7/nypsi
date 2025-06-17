-- CreateEnum
CREATE TYPE "RatingType" AS ENUM ('tv', 'movie');

-- CreateTable
CREATE TABLE "tmdbRatings" (
    "userId" TEXT NOT NULL,
    "type" "RatingType" NOT NULL,
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rating" DECIMAL(2,1) NOT NULL,

    CONSTRAINT "tmdbRatings_pkey" PRIMARY KEY ("userId","type","id")
);
