-- CreateEnum
CREATE TYPE "RatingType" AS ENUM ('tv', 'movie');

-- CreateTable
CREATE TABLE "tmdbRatings" (
    "userId" TEXT NOT NULL,
    "type" "RatingType" NOT NULL,
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "tmdbRatings_pkey" PRIMARY KEY ("userId","type","id")
);
