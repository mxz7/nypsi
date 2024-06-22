-- CreateTable
CREATE TABLE "BotMetrics" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "BotMetrics_pkey" PRIMARY KEY ("id")
);
